import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@fluentui/react';
import { jsPDF } from 'jspdf';
import { RALEWAY_REGULAR_B64, RALEWAY_BOLD_B64, HELIX_LOGO_WHITE_B64 } from '../../utils/pdfAssets';
import type { TeamData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { getAreaOfWorkIcon as getAreaOfWorkEmoji } from '../enquiries/components/prospectDisplayUtils';
import { useToast } from '../../components/feedback/ToastProvider';
import { resolveActiveCampaignContactId } from '../../utils/resolveActiveCampaignContactId';
import activecampaignIcon from '../../assets/activecampaign.svg';
import clioLogo from '../../assets/clio.svg';
import { approveVerification, draftVerificationDocumentRequest, fetchVerificationDetails } from '../../services/verificationAPI';
import {
  FaBuilding,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaCopy,
  FaCreditCard,
  FaCloudUploadAlt,
  FaDownload,
  FaEnvelope,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaExpand,
  FaFileAlt,
  FaFilePdf,
  FaFolder,
  FaFolderOpen,
  FaHardHat,
  FaBriefcase,
  FaRegFolder,
  FaHome,
  FaIdCard,
  FaLink,
  FaPassport,
  FaPaperPlane,
  FaReceipt,
  FaShieldAlt,
  FaStar,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaEdit,
  FaCode,
  FaExternalLinkAlt,
} from 'react-icons/fa';
import type { RiskCore } from '../../components/RiskAssessment';
import DocumentUploadZone from '../../components/DocumentUploadZone';
import FlatMatterOpening from './MatterOpening/FlatMatterOpening';
import CompactMatterWizard from './MatterOpening/CompactMatterWizard';
import type { POID } from '../../app/functionality/types';

type StageStatus = 'pending' | 'processing' | 'review' | 'complete' | 'neutral';
type WorkbenchTab = 'details' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents';
type ContextStageKey = 'enquiry' | 'pitch' | 'instructed';

type VerificationDetails = {
  instructionRef: string;
  clientName: string;
  clientEmail: string;
  overallResult: string;
  pepResult: string;
  addressResult: string;
  failureReasons?: Array<{ check: string; reason: string; code: string }>;
  checkedDate: string;
  rawResponse: unknown;
  documentsRequested?: boolean;
  documentsReceived?: boolean;
};

type InlineWorkbenchProps = {
  item: any;
  isDarkMode: boolean;
  initialTab?: WorkbenchTab;
  initialContextStage?: ContextStageKey | null;
  stageStatuses?: Partial<Record<WorkbenchTab | 'id', StageStatus>>;
  teamData?: TeamData[] | null;
  enableContextStageChips?: boolean;
  contextStageKeys?: ContextStageKey[];
  enableTabStages?: boolean;
  onDocumentPreview?: (doc: any) => void;
  onOpenRiskAssessment?: (instruction: any) => void;
  onOpenMatter?: (instruction: any) => void;
  onTriggerEID?: (instructionRef: string) => void | Promise<void>;
  onOpenIdReview?: (instructionRef: string) => void;
  onConfirmBankPayment?: (paymentId: string, confirmedDate: string) => void | Promise<void>;
  onRefreshData?: (instructionRef?: string) => void | Promise<void>;
  onClose?: () => void;
  currentUser?: { FullName?: string; Email?: string } | null;
  onRiskAssessmentSave?: (risk: any) => void | Promise<void>;
  demoModeEnabled?: boolean;
  flatEmbedMode?: boolean;
};

const InlineWorkbench: React.FC<InlineWorkbenchProps> = ({
  item,
  isDarkMode,
  initialTab = 'details',
  initialContextStage = null,
  stageStatuses,
  teamData,
  enableContextStageChips = false,
  contextStageKeys,
  enableTabStages = true,
  onDocumentPreview,
  onOpenRiskAssessment,
  onOpenMatter,
  onTriggerEID,
  onOpenIdReview,
  onConfirmBankPayment,
  onRefreshData,
  onClose,
  currentUser,
  onRiskAssessmentSave,
  demoModeEnabled = false,
  flatEmbedMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab);
  const [showLocalRiskModal, setShowLocalRiskModal] = useState(false);
  const [riskEditMode, setRiskEditMode] = useState(false);
  const [showLocalMatterModal, setShowLocalMatterModal] = useState(false);
  const [localPoidData, setLocalPoidData] = useState<POID[]>([]);
  const [activeContextStage, setActiveContextStage] = useState<ContextStageKey | null>(initialContextStage);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [teamsCardLink, setTeamsCardLink] = useState<string | null>(null);
  const [isTeamsLinkLoading, setIsTeamsLinkLoading] = useState(false);
  const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);
  const [isVerificationDetailsLoading, setIsVerificationDetailsLoading] = useState(false);
  const [verificationDetailsError, setVerificationDetailsError] = useState<string | null>(null);
  const [isEidDetailsExpanded, setIsEidDetailsExpanded] = useState(true);
  const [isEnquiryNotesExpanded, setIsEnquiryNotesExpanded] = useState(false);
  const [isPitchContentExpanded, setIsPitchContentExpanded] = useState(false);
  const [isRawRecordExpanded, setIsRawRecordExpanded] = useState(false);
  const [isVerificationDataExpanded, setIsVerificationDataExpanded] = useState(false);
  const [isVerificationActionLoading, setIsVerificationActionLoading] = useState(false);
  const [isTriggerEidLoading, setIsTriggerEidLoading] = useState(false);
  const [showEidActionModal, setShowEidActionModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRequestDocsModal, setShowRequestDocsModal] = useState(false);
  const [showTriggerEidConfirmModal, setShowTriggerEidConfirmModal] = useState(false);
  const [rawRecordPdfUrl, setRawRecordPdfUrl] = useState<string | null>(null);
  const [showRawRecordPdfPreview, setShowRawRecordPdfPreview] = useState(false);
  const [showEidReportPanel, setShowEidReportPanel] = useState(false);
  const [isPersistingRawRecordPdf, setIsPersistingRawRecordPdf] = useState(false);
  const [rawRecordSubmitState, setRawRecordSubmitState] = useState<'idle' | 'submitting' | 'submitted' | 'failed'>('idle');
  const [rawRecordSubmitMessage, setRawRecordSubmitMessage] = useState('');
  const [rawRecordSubmittedAt, setRawRecordSubmittedAt] = useState<string | null>(null);
  const [copiedPaymentRefId, setCopiedPaymentRefId] = useState<string | null>(null);
  const { showToast, updateToast, hideToast } = useToast();
  const [eidProcessingState, setEidProcessingState] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const eidProcessingToastRef = React.useRef<string | null>(null);
  const persistRawRecordPdfRef = React.useRef<(source?: 'manual' | 'auto') => Promise<void>>(async () => {});
  const autoReportSubmitAttemptedRef = React.useRef<Record<string, boolean>>({});
  const [emailOverrideTo, setEmailOverrideTo] = useState<string>('');
  const [emailOverrideCc, setEmailOverrideCc] = useState<string>('');
  const [useManualToRecipient, setUseManualToRecipient] = useState<boolean>(false);
  const [useManualCcRecipients, setUseManualCcRecipients] = useState<boolean>(false);
  
  // Pitch content fetch state (for when deal exists but pitch email content wasn't included)
  const [fetchedPitchContent, setFetchedPitchContent] = useState<any>(null);
  const [isFetchingPitchContent, setIsFetchingPitchContent] = useState(false);

  // Hub-side document management state
  const [hubDocuments, setHubDocuments] = useState<any[]>([]);
  const [hubDocsLoaded, setHubDocsLoaded] = useState(false);
  
  // Payment Link Request state
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
  const [paymentLinkAmount, setPaymentLinkAmount] = useState<string>('');
  const [paymentLinkDescription, setPaymentLinkDescription] = useState<string>('');
  const [paymentLinkIncludesVat, setPaymentLinkIncludesVat] = useState(true);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);
  const [createdPaymentLink, setCreatedPaymentLink] = useState<string | null>(null);
  const isCompactIdentityView = flatEmbedMode;

  const safeCopy = React.useCallback(async (text?: string | null) => {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to legacy path
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-1000px';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rawRecordPdfUrl) {
        URL.revokeObjectURL(rawRecordPdfUrl);
      }
    };
  }, [rawRecordPdfUrl]);

  const getRawRecordText = useCallback(() => {
    const raw = verificationDetails?.rawResponse || (item as any)?.instruction?.EID_Result;
    if (!raw) return 'No raw record available.';
    const parsed = parseRawResponse(raw);
    if (parsed && typeof parsed === 'object') {
      try {
        return JSON.stringify(parsed, null, 2);
      } catch {
        return String(raw ?? '');
      }
    }
    return typeof raw === 'string' ? raw : String(raw ?? '');
  }, [verificationDetails, item]);

  const normaliseVerificationFieldValue = useCallback((value: unknown): string => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue || rawValue === '—' || rawValue === '?' || /^(unknown|n\/a|na|null|undefined)$/i.test(rawValue)) {
      return '—';
    }
    return rawValue;
  }, []);

  const resolveCurrentInstructionRef = useCallback(() => {
    return (
      (item as any)?.instruction?.InstructionRef ||
      (item as any)?.instruction?.instructionRef ||
      (item as any)?.deal?.InstructionRef ||
      (item as any)?.deal?.instructionRef ||
      ''
    );
  }, [item]);

  const resolvePitchEnquiryId = useCallback((): number | null => {
    const candidates = [
      (item as any)?.enquiry?.ID,
      (item as any)?.enquiry?.id,
      (item as any)?.enquiry?.pitchEnquiryId,
      (item as any)?.instruction?.EnquiryId,
      (item as any)?.instruction?.enquiryId,
      (item as any)?.deal?.EnquiryId,
      (item as any)?.deal?.enquiryId,
      (item as any)?.deal?.ProspectId,
      (item as any)?.deal?.prospectId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
      const parsed = Number.parseInt(String(candidate ?? ''), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }, [item]);

  const resolveDocWorkspacePasscode = useCallback(async (): Promise<string> => {
    const directPasscode =
      String((item as any)?.metadata?.workspacePasscode || '').trim() ||
      String((item as any)?.deal?.Passcode || '').trim() ||
      String((item as any)?.deal?.passcode || '').trim() ||
      String((item as any)?.instruction?.Passcode || '').trim() ||
      String((item as any)?.instruction?.passcode || '').trim() ||
      String((item as any)?.pitch?.Passcode || '').trim() ||
      String((item as any)?.pitch?.passcode || '').trim();

    if (directPasscode) return directPasscode;

    const pitchEnquiryId = resolvePitchEnquiryId();
    if (!pitchEnquiryId) return '';

    try {
      const statusRes = await fetch(`/api/doc-workspace/status?enquiry_id=${pitchEnquiryId}`);
      if (!statusRes.ok) return '';
      const statusData: unknown = await statusRes.json();
      if (!statusData || typeof statusData !== 'object') return '';
      const passcode = (statusData as Record<string, unknown>).passcode;
      return typeof passcode === 'string' ? passcode.trim() : '';
    } catch {
      return '';
    }
  }, [item, resolvePitchEnquiryId]);



  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
    if (initialContextStage !== undefined) {
      setActiveContextStage(initialContextStage);
    }
  }, [initialTab, initialContextStage]);

  useEffect(() => {
    // Reset context panel when switching to a different instruction/enquiry payload.
    // But respect initialContextStage if provided
    if (!initialContextStage) {
      setActiveContextStage(null);
    }
  }, [item, initialContextStage]);

  useEffect(() => {
    // Avoid leaving the raw record expanded when switching instructions.
    setIsRawRecordExpanded(false);
  }, [verificationDetails?.instructionRef]);

  // Extract data from item
  const inst = item?.instruction;
  const deal = item?.deal;
  const enquiry = item?.enquiry || item?.Enquiry || item?.enquiryRecord || item?.prospectEnquiry || null;
  const pitch = item?.pitch || item?.Pitch || item?.pitchRecord || item?.pitchData || null;
  const eid = item?.eid;
  const risk = item?.risk;
  const parentDocuments = item?.documents || inst?.documents || [];
  const payments = (() => {
    const instructionPayments = Array.isArray(inst?.payments) ? inst.payments : [];
    const itemPayments = Array.isArray(item?.payments) ? item.payments : [];
    return instructionPayments.length > 0 ? instructionPayments : itemPayments;
  })();
  const clients = item?.clients || [];
  const matters = item?.matters || (inst as any)?.matters || [];
  const baseInstructionRef = (inst?.InstructionRef || inst?.instructionRef || deal?.InstructionRef || deal?.instructionRef || '').trim();
  const [hydratedInstruction, setHydratedInstruction] = useState<any | null>(null);

  useEffect(() => {
    setHydratedInstruction(null);
  }, [baseInstructionRef]);

  useEffect(() => {
    if (!baseInstructionRef) return;

    const hasEssentialInstructionData = Boolean(
      inst?.DOB ||
      inst?.DateOfBirth ||
      inst?.PassportNumber ||
      inst?.DriversLicenseNumber ||
      inst?.HouseNumber ||
      inst?.Street ||
      inst?.Postcode
    );

    if (hasEssentialInstructionData) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/instructions/${encodeURIComponent(baseInstructionRef)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data?.InstructionRef) {
          setHydratedInstruction(data);
        }
      } catch {
        // Silent fallback: retain existing workbench data
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseInstructionRef, inst]);

  const resolvedInstruction = hydratedInstruction || inst;

  // Hub-side document fetching (merges with parent-passed docs)
  const fetchDocuments = useCallback(async () => {
    const ref = inst?.InstructionRef || deal?.InstructionRef;
    if (!ref) return;
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(ref)}`);
      if (res.ok) {
        const data = await res.json();
        setHubDocuments(data.documents || []);
        setHubDocsLoaded(true);
      }
    } catch {
      // Silently fall back to parent-passed documents
    }
  }, [inst?.InstructionRef, deal?.InstructionRef]);

  useEffect(() => {
    if (inst?.InstructionRef || deal?.InstructionRef) {
      fetchDocuments();
    }
    return () => { setHubDocuments([]); setHubDocsLoaded(false); };
  }, [inst?.InstructionRef, deal?.InstructionRef, fetchDocuments]);

  // Use hub-fetched docs when available, fall back to parent-passed
  const documents = hubDocsLoaded ? hubDocuments : parentDocuments;

  // Check if an EID PDF already exists in instruction documents
  const existingEidPdfDoc = useMemo(() => {
    if (!documents?.length) return null;
    return documents.find((d: any) =>
      d.FileName && /eid-raw-record/i.test(d.FileName) && /\.pdf$/i.test(d.FileName)
    ) || null;
  }, [documents]);

  // Find matching matter for this instruction
  const matter = useMemo(() => {
    if (!matters?.length) return null;
    const instructionRef = inst?.InstructionRef || deal?.InstructionRef;
    const matterId = inst?.MatterId;
    
    // Try to find matching matter by InstructionRef or MatterId
    const found = matters.find((m: any) => {
      if (matterId && (m?.MatterID === matterId || String(m?.MatterID) === String(matterId))) return true;
      if (instructionRef && m?.InstructionRef === instructionRef) return true;
      return false;
    });
    
    // If no match found but we have matters, return the first one
    return found || (matters.length === 1 ? matters[0] : null);
  }, [matters, inst?.InstructionRef, inst?.MatterId, deal?.InstructionRef]);
  
  // Enrichment data passed from parent (Teams activity data from enrichmentMap)
  const enrichmentTeamsData = item?.enrichmentTeamsData as {
    teamsLink?: string;
    MessageTimestamp?: string;
    CreatedAt?: string;
    CreatedAtMs?: number;
    ClaimedAt?: string;
    ClaimedBy?: string;
  } | null | undefined;
  
  // Activity tracking (Teams card origin & AC contact)
  // Check multiple possible field locations for direct Teams tracking ID
  const teamsTrackingRecordId =
    item?.teamsTrackingRecordId ||
    item?.teamsActivityTrackingId ||
    item?.TeamsBotActivityTrackingId ||
    item?.TeamsActivityTrackingId ||
    inst?.teamsTrackingRecordId ||
    inst?.teamsActivityTrackingId ||
    (inst as any)?.TeamsBotActivityTrackingId;
  
  // ProspectId links to original enquiry - can be used to find Teams activity
  const prospectId =
    item?.ProspectId ||
    item?.prospectId ||
    enquiry?.ID ||
    enquiry?.id ||
    inst?.ProspectId ||
    inst?.prospectId ||
    deal?.ProspectId ||
    deal?.prospectId;
  
  const acContactId = resolveActiveCampaignContactId(item);

  // Track which prospectId we've already attempted to fetch pitch content for
  const pitchFetchAttemptedRef = React.useRef<string | null>(null);

  // Reset the fetch attempt tracker when prospectId changes
  useEffect(() => {
    pitchFetchAttemptedRef.current = null;
    setFetchedPitchContent(null);
  }, [prospectId]);

  // Fetch pitch content when pitch context is activated and we don't have pitch data yet
  useEffect(() => {
    const prospectIdStr = prospectId ? String(prospectId) : null;
    
    const shouldFetch = 
      activeContextStage === 'pitch' && 
      prospectIdStr && 
      !pitch && 
      !fetchedPitchContent && 
      !isFetchingPitchContent &&
      pitchFetchAttemptedRef.current !== prospectIdStr; // Prevent refetching

    if (!shouldFetch) return;

    const fetchPitchContent = async () => {
      pitchFetchAttemptedRef.current = prospectIdStr; // Mark as attempted before fetch
      setIsFetchingPitchContent(true);
      try {
        const res = await fetch(`/api/pitches/${encodeURIComponent(prospectIdStr)}?_ts=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const data = await res.json();
          const pitches = data.pitches || [];
          if (pitches.length > 0) {
            // Use the most recent pitch
            setFetchedPitchContent(pitches[0]);
          }
          // If no pitches found, fetchedPitchContent stays null but pitchFetchAttemptedRef prevents refetch
        }
      } catch (e) {
        console.warn('[InlineWorkbench] Failed to fetch pitch content:', e);
      } finally {
        setIsFetchingPitchContent(false);
      }
    };

    void fetchPitchContent();
  }, [activeContextStage, prospectId, pitch, fetchedPitchContent, isFetchingPitchContent]);

  // Merge fetched pitch content with existing pitch data
  const effectivePitch = pitch || fetchedPitchContent;

  const teamsIdentifier = useMemo(() => {
    const asNumber = (v: any): number | null => {
      const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : null;
    };

    // Prefer direct tracking record ID
    const recordId = asNumber(teamsTrackingRecordId);
    if (recordId !== null) return { type: 'id' as const, value: recordId };
    
    // Fall back to prospectId (enquiry ID) lookup
    const enquiryId = asNumber(prospectId);
    if (enquiryId !== null) return { type: 'enquiry' as const, value: enquiryId };

    return null;
  }, [teamsTrackingRecordId, prospectId]);

  const resolveTeamsCardLink = React.useCallback(async (): Promise<string | null> => {
    const alreadyProvided =
      (item?.teamsLink || item?.TeamsLink || inst?.teamsLink || (inst as any)?.TeamsLink || null) as string | null;
    if (alreadyProvided) {
      if (!teamsCardLink) setTeamsCardLink(alreadyProvided);
      return alreadyProvided;
    }

    if (!teamsIdentifier) return null;
    if (teamsCardLink) return teamsCardLink;
    if (isTeamsLinkLoading) return null;

    setIsTeamsLinkLoading(true);
    try {
      const res = await fetch(`/api/teams-activity-tracking/link/${teamsIdentifier.value}?type=${teamsIdentifier.type}`);
      if (!res.ok) return null;
      const data = await res.json();
      const link = typeof data?.teamsLink === 'string' ? data.teamsLink : null;
      if (link) setTeamsCardLink(link);
      return link;
    } catch {
      // Keep silent: badge should remain a cue, not a failure surface.
      return null;
    } finally {
      setIsTeamsLinkLoading(false);
    }
  }, [inst, isTeamsLinkLoading, item, teamsCardLink, teamsIdentifier]);

  // Helper to get value from multiple possible field names
  // Context stages (enquiry/pitch) should prefer the data available at that phase.
  const getValue = (fields: string[], fallback = '—') => {
    // Respect activeContextStage even if chips are hidden
    const contextStage: ContextStageKey = activeContextStage ?? 'enquiry';

    const sources: any[] =
      contextStage === 'enquiry'
        ? [enquiry]
        : contextStage === 'pitch'
          ? [deal, pitch, enquiry] // Include enquiry as fallback for name fields
          : [inst, clients?.[0]];

    for (const field of fields) {
      for (const source of sources) {
        const value = source?.[field];
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim().length === 0) continue;
        return value;
      }
    }
    return fallback;
  };

  // Derive values
  // NOTE: keep instructionRef sourced from instruction/deal (used for actions like ID/EID)
  const instructionRef = resolvedInstruction?.InstructionRef || resolvedInstruction?.instructionRef || deal?.InstructionRef || deal?.instructionRef || '';

  // Client identity/contact shown in Details should be stage-aware.
  const firstName = getValue(['First_Name', 'FirstName', 'firstName', 'first_name'], '');
  const lastName = getValue(['Last_Name', 'LastName', 'lastName', 'last_name'], '');
  const fullName = `${firstName} ${lastName}`.trim() || 'Unknown';
  const email = getValue(['ClientEmail', 'Email', 'email', 'LeadClientEmail', 'EmailAddress']);
  const phone = getValue(['Phone_Number', 'Telephone', 'Phone', 'phone', 'MobileNumber', 'Mobile']);
  const areaOfWork = getValue(['Area_of_Work', 'AreaOfWork', 'area', 'Area']);
  const pointOfContact = getValue(['Point_of_Contact', 'PointOfContact', 'pointOfContact', 'poc', 'Point of Contact']);
  const typeOfWork = getValue(['Type_of_Work', 'TypeOfWork', 'typeOfWork', 'tow', 'Type']);
  const methodOfContact = getValue(['Method_of_Contact', 'MethodOfContact', 'methodOfContact', 'moc', 'Method']);
  const callTaker = getValue(['Call_Taker', 'CallTaker', 'callTaker', 'rep', 'pocname']);
  const enquiryValueRaw = getValue([
    'Value',
    'value',
    'Approx_Value',
    'ApproxValue',
    'EstimatedValue',
    'Estimated_Value',
    'Dispute_Value',
    'DisputeValue',
    'Claim_Value',
    'claimValue',
  ]);
  const ultimateSource = getValue(['Ultimate_Source', 'UltimateSource', 'ultimateSource', 'Source', 'source']);
  const campaign = getValue(['Campaign', 'campaign']);
  const adGroup = getValue(['Ad_Group', 'AdGroup', 'adGroup', 'ad_group']);
  const searchKeyword = getValue(['Search_Keyword', 'SearchKeyword', 'searchKeyword', 'search_keyword']);
  const referralUrl = getValue(['Referral_URL', 'ReferralURL', 'referralUrl', 'url']);
  const website = getValue(['Website', 'website']);
  const gclid = getValue(['GCLID', 'gclid']);
  const enquiryRating = getValue(['Rating', 'rating']);
  const enquiryNotesRaw = getValue(
    [
      'Initial_first_call_notes',
      'Initial_First_Call_Notes',
      'InitialFirstCallNotes',
      'initial_first_call_notes',
      'notes',
      'Notes',
      'call_notes',
      'Call_Notes',
      'callNotes',
      'call_summary',
      'Call_Summary',
      'callSummary',
      'Summary',
      'summary',
      'Transcription',
      'transcription',
      'Transcript',
      'transcript',
      'notes',
      'Notes',
    ],
    ''
  );
  // DEBUG: Log enquiry and notes for troubleshooting
  React.useEffect(() => {
    if (enquiry) {
      console.log('[InlineWorkbench] enquiry object:', enquiry);
      console.log('[InlineWorkbench] enquiry.notes:', enquiry?.notes);
      console.log('[InlineWorkbench] enquiry.Initial_first_call_notes:', enquiry?.Initial_first_call_notes);
      console.log('[InlineWorkbench] enquiryNotesRaw:', enquiryNotesRaw);
    }
  }, [enquiry, enquiryNotesRaw]);
  const enquiryNotes = String(enquiryNotesRaw ?? '').replace(/\r\n/g, '\n');
  const hasEnquiryNotes = enquiryNotes.trim().length > 0;
  
  // Personal details
  const title = getValue(['Title', 'title', 'Salutation', 'salutation'], '');
  const dobRaw = getValue(['DateOfBirth', 'dateOfBirth', 'DOB'], '') || resolvedInstruction?.DOB || resolvedInstruction?.DateOfBirth;
  const formatDate = (raw: any) => {
    if (!raw || raw === '—') return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatRelativeDay = (value: Date): string => {
    const today = new Date();
    const target = new Date(value);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return target.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatRelativeDateOnly = (raw: any): string => {
    if (!raw || raw === '—') return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return formatRelativeDay(parsed);
  };


  const formatMoney = (raw: any): string => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
    } catch {
      return `—${n.toFixed(2)}`;
    }
  };

  const enquiryValue = (() => {
    if (!enquiryValueRaw || enquiryValueRaw === '—') return '—';
    const raw = String(enquiryValueRaw).trim();
    if (!raw) return '—';
    if (/[—$—]/.test(raw)) return raw;
    const numeric = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(numeric)) return formatMoney(numeric);
    return raw;
  })();

  const isPlaceholderSource = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '');
    return normalized === '' || normalized === '—' || normalized === 'originalforward';
  };

  const matterSource =
    matter?.Source ||
    matter?.source ||
    matter?.Ultimate_Source ||
    matter?.ultimateSource ||
    deal?.Source ||
    deal?.source ||
    '—';

  const enquirySourceSummary = (() => {
    if (!isPlaceholderSource(ultimateSource)) return String(ultimateSource);
    if (!isPlaceholderSource(matterSource)) return String(matterSource);
    if (campaign && campaign !== '—') return String(campaign);
    if (referralUrl && referralUrl !== '—') return String(referralUrl);
    return '—';
  })();
  
  // Submission date (after formatDate is defined)
  // 'datetime' is the new-space enquiry arrival timestamp (from enquiry-processing-v2).
  // 'Touchpoint_Date' is the legacy enquiry date. 'created_at' is DB insertion time (can match claim time — DO NOT use for duration).
  const submissionDateRaw = getValue(['Touchpoint_Date', 'Date_Created', 'DateCreated', 'datetime', 'SubmissionDate', 'submission_date', 'DateSubmitted', 'InstructionDate']);
  const submissionDate = formatDate(submissionDateRaw);

  // Timeline dates - include effectivePitch for fetched pitch content
  const pitchDateRaw = deal?.PitchedDate || deal?.pitchedDate || deal?.CreatedDate || deal?.createdDate || effectivePitch?.CreatedAt || effectivePitch?.createdAt || effectivePitch?.pitchedDate || effectivePitch?.PitchedDate || pitch?.CreatedAt || pitch?.createdAt || pitch?.pitchedDate || pitch?.PitchedDate || null;
  const pitchDate = formatDate(pitchDateRaw);
  
  // Matter open date - prioritize matter object from new space
  const matterOpenDateRaw = matter?.OpenDate || matter?.['Open Date'] || matter?.open_date || matter?.OpenedDate || matter?.opened_at || getValue(['MatterOpenDate', 'matter_open_date', 'MatterCreatedDate', 'OpenedDate', 'opened_at']);
  const matterOpenDate = formatDate(matterOpenDateRaw);
  
  // Get first successful payment date
  const firstSuccessfulPayment = payments.find((p: any) => 
    p.payment_status === 'succeeded' || p.payment_status === 'confirmed'
  );
  const paymentDateRaw = firstSuccessfulPayment?.created_at || firstSuccessfulPayment?.date || firstSuccessfulPayment?.payment_date || null;
  const paymentDate = formatDate(paymentDateRaw);
  
  // Get document upload dates
  const documentDates = (documents || [])
    .map((doc: any) => doc.UploadDate || doc.created_at || doc.date)
    .filter(Boolean)
    .map((d: any) => new Date(d))
    .filter((d: Date) => !Number.isNaN(d.getTime()))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());
  const firstDocUploadDateRaw = documentDates[0] || null;
  const firstDocUploadDate = firstDocUploadDateRaw ? formatDate(firstDocUploadDateRaw) : null;

  const dob = formatDate(dobRaw);
  const age = React.useMemo(() => {
    if (!dobRaw || dobRaw === '—') return '—';
    const parsed = new Date(dobRaw);
    if (Number.isNaN(parsed.getTime())) return '—';
    const diff = Date.now() - parsed.getTime();
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return String(years);
  }, [dobRaw]);
  const gender = getValue(['Gender', 'gender', 'Sex', 'sex']);
  const nationalityFull = getValue(['Nationality', 'nationality'], '') || resolvedInstruction?.Nationality || resolvedInstruction?.nationality || '—';
  
  // Convert nationality to alpha code
  const nationalityAlpha = React.useMemo(() => {
    if (!nationalityFull || nationalityFull === '—') return '—';
    const countryToAlpha: Record<string, string> = {
      'United Kingdom': 'GB', 'UK': 'GB', 'Great Britain': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB', 'Northern Ireland': 'GB',
      'United States': 'US', 'USA': 'US', 'America': 'US',
      'Ireland': 'IE', 'Republic of Ireland': 'IE',
      'France': 'FR', 'Germany': 'DE', 'Spain': 'ES', 'Italy': 'IT', 'Portugal': 'PT',
      'Netherlands': 'NL', 'Belgium': 'BE', 'Poland': 'PL', 'Romania': 'RO', 'Greece': 'GR',
      'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI',
      'Australia': 'AU', 'New Zealand': 'NZ', 'Canada': 'CA',
      'India': 'IN', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Sri Lanka': 'LK',
      'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR', 'Hong Kong': 'HK', 'Singapore': 'SG',
      'South Africa': 'ZA', 'Nigeria': 'NG', 'Kenya': 'KE', 'Ghana': 'GH',
      'Brazil': 'BR', 'Mexico': 'MX', 'Argentina': 'AR',
      'Russia': 'RU', 'Ukraine': 'UA', 'Turkey': 'TR',
      'British': 'GB', 'American': 'US', 'Irish': 'IE', 'French': 'FR', 'German': 'DE', 'Spanish': 'ES', 'Italian': 'IT',
      'Polish': 'PL', 'Romanian': 'RO', 'Indian': 'IN', 'Pakistani': 'PK', 'Chinese': 'CN', 'Australian': 'AU', 'Canadian': 'CA',
    };
    const upper = nationalityFull.trim();
    // Check exact match first
    if (countryToAlpha[upper]) return countryToAlpha[upper];
    // Check case-insensitive
    const lowerKey = Object.keys(countryToAlpha).find(k => k.toLowerCase() === upper.toLowerCase());
    if (lowerKey) return countryToAlpha[lowerKey];
    // If already 2-3 char code, return as-is
    if (upper.length <= 3 && upper === upper.toUpperCase()) return upper;
    // Fall back to first 2 chars uppercase
    return upper.substring(0, 2).toUpperCase();
  }, [nationalityFull]);
  
  // ID status
  const passport = getValue(['PassportNumber', 'passportNumber'], '') || resolvedInstruction?.PassportNumber || resolvedInstruction?.passportNumber || '—';
  const license = getValue(['DriversLicenseNumber', 'driversLicenseNumber', 'DrivingLicenseNumber'], '') || resolvedInstruction?.DriversLicenseNumber || resolvedInstruction?.driversLicenseNumber || resolvedInstruction?.DrivingLicenseNumber || '—';
  const passportExpiryRaw = getValue(['PassportExpiry', 'PassportExpiryDate', 'passportExpiry', 'passportExpiryDate']);
  const licenseExpiryRaw = getValue(['DriversLicenseExpiry', 'DrivingLicenseExpiry', 'DrivingLicenceExpiry', 'LicenseExpiry', 'licenseExpiry']);
  const passportExpiry = formatDate(passportExpiryRaw);
  const licenseExpiry = formatDate(licenseExpiryRaw);
  const hasId = passport !== '—' || license !== '—';
  
  // Get the primary ID expiry (passport preferred, then license)
  const primaryIdExpiryRaw = passport !== '—' ? passportExpiryRaw : licenseExpiryRaw;
  const primaryIdExpiry = passport !== '—' ? passportExpiry : licenseExpiry;
  const primaryIdType = passport !== '—' ? 'Passport' : license !== '—' ? 'License' : null;
  
  // Calculate expiry status color (green = 3 years away, neutral = today/expired)
  const getExpiryStatusColor = (expiryRaw: string | null | undefined, isDark: boolean): { color: string; label: string } => {
    if (!expiryRaw || expiryRaw === '—') return { color: isDark ? colours.subtleGrey : colours.greyText, label: '' };
    const expiry = new Date(expiryRaw);
    if (Number.isNaN(expiry.getTime())) return { color: isDark ? colours.subtleGrey : colours.greyText, label: '' };
    
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const maxDays = 3 * 365; // 3 years in days
    
    if (diffDays <= 0) {
      return { color: '#D65541', label: 'Expired' }; // Red for expired
    }
    if (diffDays <= 90) {
      return { color: '#f97316', label: 'Expiring soon' }; // Orange for < 3 months
    }
    if (diffDays <= 365) {
      return { color: '#eab308', label: '' }; // Yellow for < 1 year
    }
    
    // Gradient from yellow (1 year) to blue (3 years)
    const ratio = Math.min(diffDays / maxDays, 1);
    if (ratio >= 0.9) return { color: colours.highlight, label: '' }; // Full blue
    if (ratio >= 0.66) return { color: colours.blue, label: '' }; // Mid blue
    return { color: colours.missedBlue, label: '' }; // Deep blue
  };
  
  // Address
  const getInstValue = (keys: string[]) => {
    if (!resolvedInstruction) return undefined;
    for (const k of keys) {
      if (resolvedInstruction[k] && resolvedInstruction[k] !== '—') return resolvedInstruction[k];
    }
    return undefined;
  };

  const houseNum = getValue(['HouseNumber', 'houseNumber'], '') || getInstValue(['HouseNumber', 'houseNumber']);
  const street = getValue(['Street', 'street'], '') || getInstValue(['Street', 'street']);
  const streetFull = `${houseNum || ''} ${street || ''}`.trim() || '—';
  const city = getValue(['City', 'city', 'Town'], '') || getInstValue(['City', 'city', 'Town']);
  const county = getValue(['County', 'county'], '') || getInstValue(['County', 'county']);
  const postcode = getValue(['Postcode', 'postcode', 'PostCode'], '') || getInstValue(['Postcode', 'postcode']);
  const country = getValue(['Country', 'country'], '') || getInstValue(['Country', 'country']);
  const address = [streetFull, city, county, postcode].filter(v => v && v !== '—').join(', ') || undefined;
  
  // Entity/Company
  const companyName = getValue(['CompanyName', 'Company', 'company']);
  const companyNo = getValue(['CompanyNumber', 'companyNumber', 'CompanyNo']);
  const companyCountry = getValue(['CompanyCountry', 'companyCountry']);
  
  // Client type detection
  const clientType = getValue(['ClientType', 'clientType', 'Client_Type']);
  const isCompany = clientType?.toLowerCase() === 'company' || companyName !== '—';
  
  // Company address fields
  const companyHouseNum = getValue(['CompanyHouseNumber', 'companyHouseNumber'], '');
  const companyStreet = getValue(['CompanyStreet', 'companyStreet'], '');
  const companyStreetFull = `${companyHouseNum} ${companyStreet}`.trim() || '—';
  const companyCity = getValue(['CompanyCity', 'companyCity']);
  const companyCounty = getValue(['CompanyCounty', 'companyCounty']);
  const companyPostcode = getValue(['CompanyPostcode', 'companyPostcode']);
  
  // Display address (company if company client, individual otherwise)
  const displayHouseNum = isCompany && companyHouseNum ? companyHouseNum : houseNum;
  const displayStreetOnly = isCompany && companyStreet ? companyStreet : street;
  const displayStreet = isCompany && companyStreetFull !== '—' ? companyStreetFull : streetFull;
  const displayCity = isCompany && companyCity !== '—' ? companyCity : city;
  const displayCounty = isCompany && companyCounty !== '—' ? companyCounty : county;
  const displayPostcode = isCompany && companyPostcode !== '—' ? companyPostcode : postcode;
  const displayCountry = isCompany && companyCountry !== '—' ? companyCountry : country;

  const displayHouseNumTrimmed = (displayHouseNum || '').trim();
  
  // EID
  const eidResult = eid?.EIDOverallResult || '';
  const eidStatusValue = (eid?.EIDStatus || '').toLowerCase();
  // Detect manual approval: EIDOverallResult === 'Verified' (exact case) indicates manual override
  const isManuallyApproved = eidResult === 'Verified';
  const eidStatus = eidStatusValue.includes('pending') || eidStatusValue.includes('processing')
    ? 'pending'
    : eidResult.toLowerCase().includes('pass') || eidResult.toLowerCase().includes('verified')
    ? 'verified'
    : eidResult.toLowerCase().includes('fail')
    ? 'failed'
    : eidResult.toLowerCase().includes('skip')
    ? 'skipped'
    : eidResult.toLowerCase().includes('refer') || eidResult.toLowerCase().includes('consider') || eidResult.toLowerCase().includes('review')
    ? 'review'
    : eid
    ? 'completed'
    : 'pending';
  const pepResult = eid?.PEPAndSanctionsCheckResult || '—';
  const addressVerification = eid?.AddressVerificationResult || '—';
  // Check if there are underlying issues that were manually overridden
  const hasUnderlyingIssues = isManuallyApproved && (
    addressVerification.toLowerCase().includes('review') ||
    addressVerification.toLowerCase().includes('fail') ||
    pepResult.toLowerCase().includes('review') ||
    pepResult.toLowerCase().includes('fail')
  );
  const eidDate = eid?.EIDCheckedDate ? new Date(eid.EIDCheckedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isDemoInstruction = Boolean((item as any)?.isDemo || (item as any)?.rawData?.isDemo || instructionRef === 'HLX-DEMO-00001');

  type DemoEidOutcome = 'pass' | 'review' | 'fail' | 'manual-approved';
  type DemoEidSubResult = 'passed' | 'review' | 'failed';
  interface DemoEidSimConfig {
    outcome: DemoEidOutcome;
    pepResult: DemoEidSubResult;
    addressResult: DemoEidSubResult;
  }
  const DEMO_EID_RAW_RESPONSE_SAMPLE = [
    {
      correlationId: '632aabdd-227d-4051-ab86-ea766efc7baa',
      externalReferenceId: '18207',
      checkStatuses: [
        {
          sourceResults: {
            id: 2719999,
            date: '2026-02-23T15:41:53.29',
            rule: 'Address Verification Check',
            ruleId: 2,
            status: { id: 3, status: 'Completed' },
            result: { id: 1, result: 'Passed' },
            title: 'Address Verification Check',
            summaryTitle: 'Information used in check',
            results: [
              {
                id: 3961853,
                title: 'UK identity verification',
                description: 'UK identity verification sources',
                result: 'Passed',
                recordedDate: '2026-02-23 15:41:53',
                detail: {
                  reasons: [
                    { id: 42449450, key: 'Name, Address and DOB Match', result: 'Passed', reason: 'A check for the name and date of birth has been matched to the provided address', code: '6100' },
                    { id: 42449451, key: 'Name and Address Match', result: 'Review', reason: 'A check for the name has not been matched to the provided address', code: '7110' },
                    { id: 42449452, key: 'Mortality Register', result: 'Passed', reason: 'Name and address not found on the Millennium Mortality file', code: 'C9110' },
                    { id: 42449453, key: 'Name and Address Match', result: 'Passed', reason: 'Evidence found that the address supplied may not be the current address AND no match found at current address', code: 'C4002' },
                  ],
                },
              },
            ],
          },
          result: { id: 1, result: 'Passed' },
          id: 'db0c50e9-ad9a-4ecf-9ce3-44f8acb80813',
          checkTypeId: 1,
          externalCheckReferenceId: null,
          status: { id: 3, status: 'Complete' },
          resultCount: { totalSourcesChecked: 1, totalSourcesPassed: 1, totalSourcesFailed: 0, totalSourcesForReview: 0 },
        },
        {
          sourceResults: {
            id: 2720000,
            date: '2026-02-23T15:41:53.79',
            rule: 'Pep & Sanctions Check',
            ruleId: 4,
            status: { id: 3, status: 'Completed' },
            result: { id: 1, result: 'Passed' },
            title: 'Pep & Sanctions Check',
            summaryTitle: 'Information used in check',
            results: [
              {
                id: 3961854,
                title: 'Pep Check',
                description: 'Pep Check',
                result: 'Passed',
                recordedDate: '2026-02-23 15:41:53',
                detail: {
                  reasons: [
                    { id: 42449454, key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                  ],
                },
              },
              {
                id: 3961855,
                title: 'Sanctions Check',
                description: 'Sanctions Check',
                result: 'Passed',
                recordedDate: '2026-02-23 15:41:53',
                detail: {
                  reasons: [
                    { id: 42449455, key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                  ],
                },
              },
              {
                id: 3961856,
                title: 'Adverse Media Check',
                description: 'Adverse Media Check',
                result: 'Passed',
                recordedDate: '2026-02-23 15:41:53',
                detail: {
                  reasons: [
                    { id: 42449456, key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                  ],
                },
              },
            ],
            resultsExcludedByFilters: [],
          },
          result: { id: 1, result: 'Passed' },
          id: '6a804bee-2e5e-4e3b-aa86-554110ceccb2',
          checkTypeId: 2,
          externalCheckReferenceId: null,
          status: { id: 3, status: 'Complete' },
          resultCount: { totalSourcesChecked: 3, totalSourcesPassed: 3, totalSourcesFailed: 0, totalSourcesForReview: 0 },
        },
      ],
      overallResult: { id: 1, result: 'Passed' },
      overallStatus: { id: 3, status: 'Completed' },
    },
  ] as const;
  const DEMO_EID_SIM_CONFIG_KEY = 'demoEidSimulationConfig';
  const readDemoEidSimConfig = React.useCallback((): DemoEidSimConfig => {
    try {
      const raw = window.localStorage.getItem(DEMO_EID_SIM_CONFIG_KEY);
      if (!raw) return { outcome: 'pass', pepResult: 'passed', addressResult: 'passed' };
      const parsed = JSON.parse(raw) as Partial<DemoEidSimConfig>;
      const outcome: DemoEidOutcome =
        parsed.outcome === 'review' || parsed.outcome === 'fail' || parsed.outcome === 'manual-approved' || parsed.outcome === 'pass'
          ? parsed.outcome
          : 'pass';
      const pepResult: DemoEidSubResult = parsed.pepResult === 'review' || parsed.pepResult === 'failed' || parsed.pepResult === 'passed'
        ? parsed.pepResult
        : 'passed';
      const addressResult: DemoEidSubResult = parsed.addressResult === 'review' || parsed.addressResult === 'failed' || parsed.addressResult === 'passed'
        ? parsed.addressResult
        : 'passed';
      return { outcome, pepResult, addressResult };
    } catch {
      return { outcome: 'pass', pepResult: 'passed', addressResult: 'passed' };
    }
  }, []);

  const [demoEidSimConfig, setDemoEidSimConfig] = React.useState<DemoEidSimConfig>(() => {
    if (typeof window === 'undefined') return { outcome: 'pass', pepResult: 'passed', addressResult: 'passed' };
    return readDemoEidSimConfig();
  });

  const persistDemoEidSimConfig = React.useCallback((next: DemoEidSimConfig) => {
    try {
      window.localStorage.setItem(DEMO_EID_SIM_CONFIG_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('demoEidSimConfigChanged'));
    } catch {
      // Ignore demo config persistence failures.
    }
  }, []);

  const activeCampaignBlueFilter = 'invert(33%) sepia(98%) saturate(1766%) hue-rotate(190deg) brightness(95%) contrast(92%)';

  const loadVerificationDetails = React.useCallback(async () => {
    if (!instructionRef) return;

    setIsVerificationDetailsLoading(true);
    setVerificationDetailsError(null);
    try {
      if (isDemoInstruction) {
        const inst = (item as any)?.instruction ?? {};
        const demoFullName = `${inst.Forename || inst.FirstName || 'Test'} ${inst.Surname || inst.LastName || 'Client'}`.trim();
        const demoClientName = demoFullName && demoFullName !== ' ' ? demoFullName : (inst.CompanyName || 'Demo client');
        const demoEmail = inst.Email || inst.ClientEmail || 'test.client@example.com';

        setVerificationDetails({
          instructionRef,
          clientName: demoClientName,
          clientEmail: demoEmail,
          overallResult: eidResult || (eidStatusValue.includes('pending') ? 'pending' : '—'),
          pepResult: pepResult || (eidStatusValue.includes('pending') ? 'pending' : '—'),
          addressResult: addressVerification || (eidStatusValue.includes('pending') ? 'pending' : '—'),
          checkedDate: eidDate,
          rawResponse: DEMO_EID_RAW_RESPONSE_SAMPLE,
          documentsRequested: false,
          documentsReceived: false,
        });
        return;
      }

      const details = (await fetchVerificationDetails(instructionRef)) as VerificationDetails;

      const prefer = (primary: string | undefined, fallback: string | undefined) => {
        const primaryValue = (primary ?? '').trim();
        if (primaryValue && primaryValue !== '—') return primaryValue;
        const fallbackValue = (fallback ?? '').trim();
        if (fallbackValue) return fallbackValue;
        return '—';
      };

      // Keep display stable: if we already have EID summary strings on the instruction, prefer them.
      setVerificationDetails({
        ...details,
        overallResult: prefer(eidResult, details.overallResult),
        pepResult: prefer(pepResult, details.pepResult),
        addressResult: prefer(addressVerification, details.addressResult),
        checkedDate: details.checkedDate || eidDate,
      });
    } catch {
      setVerificationDetailsError('Failed to load verification details.');
    } finally {
      setIsVerificationDetailsLoading(false);
    }
  }, [instructionRef, isDemoInstruction, item, eidResult, eidStatusValue, pepResult, addressVerification, eidDate]);

  const openEidDetails = React.useCallback(() => {
    setIsEidDetailsExpanded(true);
    void loadVerificationDetails();
  }, [loadVerificationDetails]);

  const openTriggerEidConfirm = React.useCallback(() => {
    if (isDemoInstruction) {
      setDemoEidSimConfig(readDemoEidSimConfig());
    }
    setShowTriggerEidConfirmModal(true);
  }, [isDemoInstruction, readDemoEidSimConfig]);

  const handleTriggerEid = React.useCallback(async () => {
    if (!onTriggerEID || !instructionRef) return;
    setShowTriggerEidConfirmModal(false);
    setIsTriggerEidLoading(true);
    setEidProcessingState('processing');

    // Show persistent loading toast
    const toastId = showToast({ type: 'loading', message: 'Running ID verification…', persist: true });
    eidProcessingToastRef.current = toastId;

    try {
      await onTriggerEID(instructionRef);
      setEidProcessingState('complete');

      // Update the toast to success
      if (toastId) {
        updateToast(toastId, { type: 'success', message: 'ID verification complete', persist: false });
      }

      // Auto-refresh data so the UI updates without a manual reload
      if (onRefreshData) {
        try { await onRefreshData?.(instructionRef); } catch { /* silent */ }
      }

      // Auto-upload the EID report PDF to instruction documents (fire-and-forget)
      // Small delay so verification data has populated after the refresh
      setTimeout(() => {
        void persistRawRecordPdfRef.current('auto');
      }, 2000);
    } catch {
      setEidProcessingState('error');
      if (toastId) {
        updateToast(toastId, { type: 'error', message: 'ID verification failed — please retry', persist: false });
      }
    } finally {
      setIsTriggerEidLoading(false);
      eidProcessingToastRef.current = null;
    }
  }, [onTriggerEID, instructionRef, showToast, updateToast, isDemoInstruction, onRefreshData]);

  useEffect(() => {
    if (activeTab !== 'identity') return;
    if (!isEidDetailsExpanded) return;
    if (!instructionRef) return;
    if (verificationDetails || isVerificationDetailsLoading) return;
    void loadVerificationDetails();
  }, [activeTab, instructionRef, isEidDetailsExpanded, verificationDetails, isVerificationDetailsLoading, loadVerificationDetails]);

  useEffect(() => {
    if (!isDemoInstruction) return;
    if (activeTab !== 'identity') return;
    if (!instructionRef) return;
    // Demo mode: keep the locally-derived details aligned with the simulated EID record.
    void loadVerificationDetails();
  }, [isDemoInstruction, activeTab, instructionRef, eid?.EIDStatus, eid?.EIDOverallResult, loadVerificationDetails]);

  useEffect(() => {
    if (!isDemoInstruction) return;
    if (!instructionRef) return;

    if (existingEidPdfDoc) {
      setRawRecordSubmitState('submitted');
      setRawRecordSubmitMessage('Report submitted');
      setRawRecordSubmittedAt(existingEidPdfDoc.UploadedAt || null);
      return;
    }

    if (eidStatus === 'pending') return;
    if (autoReportSubmitAttemptedRef.current[instructionRef]) return;

    autoReportSubmitAttemptedRef.current[instructionRef] = true;
    void persistRawRecordPdfRef.current('auto');
  }, [isDemoInstruction, instructionRef, existingEidPdfDoc, eidStatus]);

  const parseRawResponse = React.useCallback((raw: unknown) => {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw as any;
  }, []);

  const getPrimaryRawVerificationRecord = React.useCallback((raw: unknown) => {
    const parsed = parseRawResponse(raw);
    if (Array.isArray(parsed)) {
      return parsed.find((entry) => entry && typeof entry === 'object') || null;
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  }, [parseRawResponse]);

  const normaliseMetaText = React.useCallback((value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null;
    }
    if (typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }, []);

  const formatMaybeDate = React.useCallback((value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return trimmed;
    }
    if (typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return null;
  }, []);

  const isMeaningfulFailureReason = React.useCallback((value: unknown): boolean => {
    const text = String(value ?? '').trim();
    if (!text) return false;
    const lower = text
      .toLowerCase()
      .replace(/\u00a0/g, ' ') // nbsp
      .replace(/\s+/g, ' ')
      .trim();

    // Common placeholders that should never appear as a "failure".
    if (lower === 'n/a' || lower === 'na' || lower === 'not applicable') return false;
    if (lower.includes('(n/a)') || lower.includes('not applicable')) return false;

    // Generic, non-actionable messages.
    if (lower === 'check failed') return false;
    if (lower === 'check failed or requires review') return false;
    if (lower === 'check failed or requires review (n/a)') return false;
    if (lower === 'verification requires review') return false;
    if (lower.startsWith('check failed') && lower.includes('n/a')) return false;
    return true;
  }, []);

  const eidTileDetails = React.useMemo(() => {
    const baseCheckedAt = verificationDetails
      ? (formatMaybeDate(verificationDetails.checkedDate) || verificationDetails.checkedDate || eidDate || '—')
      : (eidDate || '—');

    const raw = verificationDetails ? getPrimaryRawVerificationRecord(verificationDetails.rawResponse) : null;
    const checkStatuses = Array.isArray(raw?.checkStatuses) ? raw.checkStatuses : [];

    const groupFailures = (failures: VerificationDetails['failureReasons'] | undefined) => {
      const map = new Map<string, Array<{ reason: string; code?: string }>>();
      (failures || []).forEach((f) => {
        if (!isMeaningfulFailureReason(f.reason)) return;
        const key = (f.check || 'Verification Check').trim() || 'Verification Check';
        const existing = map.get(key) || [];
        existing.push({ reason: f.reason, code: f.code });
        map.set(key, existing);
      });
      return map;
    };

    const failuresByCheck = groupFailures(verificationDetails?.failureReasons);

    const extractCheckedAt = (checkStatus: any): string => {
      const candidates = [
        checkStatus?.checkedDate,
        checkStatus?.checkedAt,
        checkStatus?.timestamp,
        checkStatus?.createdAt,
        checkStatus?.completedAt,
        checkStatus?.result?.checkedDate,
        checkStatus?.result?.checkedAt,
        checkStatus?.result?.timestamp,
        checkStatus?.result?.createdAt,
        checkStatus?.result?.completedAt,
      ];
      for (const c of candidates) {
        const formatted = formatMaybeDate(c);
        if (formatted) return formatted;
      }
      return baseCheckedAt;
    };

    const extractFailuresFromCheckStatus = (checkStatus: any): Array<{ reason: string; code?: string }> => {
      const failures: Array<{ reason: string; code?: string }> = [];
      const sourceResults = checkStatus?.sourceResults;
      const results = Array.isArray(sourceResults?.results) ? sourceResults.results : [];
      results.forEach((r: any) => {
        const reasons = Array.isArray(r?.detail?.reasons) ? r.detail.reasons : [];
        reasons.forEach((reason: any) => {
          const result = String(reason?.result || '').toLowerCase();
          if (result === 'review' || result === 'fail' || result === 'failed') {
            const reasonText = reason?.reason || 'Verification requires review';
            if (!isMeaningfulFailureReason(reasonText)) return;
            failures.push({
              reason: reasonText,
              code: reason?.code,
            });
          }
        });
      });
      return failures;
    };

    const pepStatus = checkStatuses.find((s: any) => s?.checkTypeId === 2 || String(s?.sourceResults?.rule || '').toLowerCase().includes('pep'));
    const addressStatus = checkStatuses.find((s: any) => s?.checkTypeId === 1 || String(s?.sourceResults?.rule || '').toLowerCase().includes('address'));

    const pepFailuresFromStatus = pepStatus ? extractFailuresFromCheckStatus(pepStatus) : [];
    const addressFailuresFromStatus = addressStatus ? extractFailuresFromCheckStatus(addressStatus) : [];

    const sanitiseFailures = (failures: Array<{ reason: string; code?: string }>) =>
      failures.filter((f) => isMeaningfulFailureReason(f.reason));

    return {
      overall: {
        checkedAt: baseCheckedAt,
        failures: [] as Array<{ reason: string; code?: string }>,
      },
      pep: {
        checkedAt: pepStatus ? extractCheckedAt(pepStatus) : baseCheckedAt,
        failures: sanitiseFailures(pepFailuresFromStatus.length > 0 ? pepFailuresFromStatus : (failuresByCheck.get('PEP & Sanctions Check') || [])),
      },
      address: {
        checkedAt: addressStatus ? extractCheckedAt(addressStatus) : baseCheckedAt,
        failures: sanitiseFailures(addressFailuresFromStatus.length > 0 ? addressFailuresFromStatus : (failuresByCheck.get('Address Verification') || [])),
      },
    };
  }, [verificationDetails, eidDate, getPrimaryRawVerificationRecord, formatMaybeDate, isMeaningfulFailureReason]);

  const rawCheckResultSnapshot = React.useMemo(() => {
    const raw = verificationDetails ? getPrimaryRawVerificationRecord(verificationDetails.rawResponse) : null;
    const checkStatuses = Array.isArray(raw?.checkStatuses) ? raw.checkStatuses : [];

    const extractCheckResult = (predicate: (status: any) => boolean) => {
      const match = checkStatuses.find(predicate);
      const result = match?.sourceResults?.result?.result || match?.result?.result || '';
      return normaliseVerificationFieldValue(result);
    };

    return {
      overall: normaliseVerificationFieldValue(raw?.overallResult?.result || raw?.overallResult || ''),
      pep: extractCheckResult((status: any) => status?.checkTypeId === 2 || /pep|sanction/i.test(String(status?.sourceResults?.rule || ''))),
      address: extractCheckResult((status: any) => status?.checkTypeId === 1 || /address/i.test(String(status?.sourceResults?.rule || ''))),
    };
  }, [verificationDetails, getPrimaryRawVerificationRecord, normaliseVerificationFieldValue]);

  const verificationMeta = React.useMemo(() => {
    const raw = verificationDetails ? getPrimaryRawVerificationRecord(verificationDetails.rawResponse) : null;

    const providerCandidates: string[] = [];
    const addProviderCandidate = (value: unknown) => {
      const v = normaliseMetaText(value);
      if (!v) return;
      providerCandidates.push(v);
    };

    // Try common top-level provider fields.
    addProviderCandidate(raw?.provider);
    addProviderCandidate(raw?.providerName);
    addProviderCandidate(raw?.vendor);
    addProviderCandidate(raw?.vendorName);
    addProviderCandidate(raw?.supplier);
    addProviderCandidate(raw?.source);
    addProviderCandidate(raw?.integration);

    // Try to infer from checkStatuses sourceResults.
    const checkStatuses = Array.isArray(raw?.checkStatuses) ? raw.checkStatuses : [];
    checkStatuses.forEach((status: any) => {
      addProviderCandidate(status?.sourceResults?.source);
      addProviderCandidate(status?.sourceResults?.sourceName);
      addProviderCandidate(status?.sourceResults?.provider);
      addProviderCandidate(status?.sourceResults?.providerName);
    });

    const provider = Array.from(new Set(providerCandidates.map((p) => p.trim()).filter(Boolean)))[0] || 'Tiller Technologies Limited';

    const pickFromObjects = (key: string): string | null => {
      const objects = [raw, raw?.meta, raw?.metadata, raw?.result, raw?.data, raw?.payload].filter(Boolean);
      for (const obj of objects) {
        if (obj && typeof obj === 'object' && key in (obj as any)) {
          const v = normaliseMetaText((obj as any)[key]);
          if (v) return v;
        }
      }
      return null;
    };

    const pickFirst = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = pickFromObjects(k);
        if (v) return v;
      }
      return null;
    };

    const findFirstByKeysDeep = (root: unknown, keys: string[]): string | null => {
      const keySet = new Set(keys.map((k) => k.toLowerCase()));
      const visited = new Set<any>();
      const stack: any[] = [root];

      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (visited.has(node)) continue;
        visited.add(node);

        if (Array.isArray(node)) {
          for (const item of node) stack.push(item);
          continue;
        }

        for (const [k, v] of Object.entries(node as any)) {
          if (keySet.has(String(k).toLowerCase())) {
            const candidate = normaliseMetaText(v);
            if (candidate) return candidate;
          }
          if (v && typeof v === 'object') stack.push(v);
        }
      }

      return null;
    };

    const references: Array<{ label: string; value: string }> = [];
    const requestId = pickFirst(['requestId', 'requestID', 'request_id']);
    const transactionId = pickFirst(['transactionId', 'transactionID', 'transaction_id']);
    const reportId = pickFirst(['reportId', 'reportID', 'report_id']);
    const verificationId = pickFirst(['verificationId', 'verificationID', 'verification_id']);
    const checkId = pickFirst(['checkId', 'checkID', 'check_id']);
    const referenceId = pickFirst(['referenceId', 'referenceID', 'reference_id', 'reference']);

    const correlationIdKeys = [
      'correlationId',
      'correlationID',
      'correlation_id',
      'correlation',
      'x-correlation-id',
      'xCorrelationId',
    ];
    const correlationId = findFirstByKeysDeep(raw, correlationIdKeys) || pickFirst(['tillerCorrelationId', 'tiller_correlation_id', 'tillerId', 'tiller_id']);

    const pushIf = (label: string, value: string | null) => {
      if (!value) return;
      references.push({ label, value });
    };

    pushIf('Ref', referenceId);
    pushIf('Verification', verificationId);
    pushIf('Report', reportId);
    pushIf('Request', requestId);
    pushIf('Txn', transactionId);
    pushIf('Check', checkId);

    return {
      provider,
      references,
      correlationId: correlationId || '—',
    };
  }, [verificationDetails, normaliseMetaText, getPrimaryRawVerificationRecord]);

  const buildRawRecordPdfBlob = useCallback(() => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = 595.28;
    const pageH = 841.89;
    const marginL = 40;
    const marginR = 40;
    const contentW = pageW - marginL - marginR;
    const currentInstructionRef = resolveCurrentInstructionRef();

    // ── Register Raleway fonts ──
    try {
      doc.addFileToVFS('Raleway-Regular.ttf', RALEWAY_REGULAR_B64);
      doc.addFont('Raleway-Regular.ttf', 'Raleway', 'normal');
      doc.addFileToVFS('Raleway-Bold.ttf', RALEWAY_BOLD_B64);
      doc.addFont('Raleway-Bold.ttf', 'Raleway', 'bold');
    } catch (e) {
      // Fall back to helvetica if font registration fails
      console.warn('Raleway font registration failed, falling back to helvetica', e);
    }

    const fontFamily = doc.getFontList()['Raleway'] ? 'Raleway' : 'helvetica';

    // ── Brand tokens (from colours.ts) ──
    const navy   = { r: 6,   g: 23,  b: 51  }; // #061733  darkBlue
    const helix  = { r: 13,  g: 47,  b: 96  }; // #0D2F60  helixBlue
    const blue   = { r: 54,  g: 144, b: 206 }; // #3690CE  highlight
    const green  = { r: 32,  g: 178, b: 108 }; // #20b26c  success
    const red    = { r: 214, g: 85,  b: 65  }; // #D65541  cta
    const grey   = { r: 107, g: 107, b: 107 }; // #6B6B6B  greyText
    const lGrey  = { r: 244, g: 244, b: 246 }; // #F4F4F6  grey surface
    const ftrGrey = { r: 107, g: 114, b: 128 }; // #6B7280 footer text

    const headerH = 72;
    const footerH = 36;
    const footerTop = pageH - footerH;
    let y = 0;

    // ── Colour helpers ──
    const passFailCol = (v: string) => {
      const lc = (v || '').toLowerCase();
      if (lc.includes('pass') || lc.includes('verified') || lc.includes('clear')) return green;
      if (lc.includes('fail')) return red;
      if (lc.includes('review')) return blue;
      return grey;
    };

    // ── Parse raw record ──
    const rawData = verificationDetails?.rawResponse || (item as any)?.instruction?.EID_Result;
    const rec = rawData ? getPrimaryRawVerificationRecord(rawData) : null;
    const checks: any[] = Array.isArray(rec?.checkStatuses) ? rec.checkStatuses : [];
    const overallResult = rec?.overallResult?.result || eidResult || '\u2014';
    const checkedDateStr = verificationDetails?.checkedDate || eidDate || '\u2014';
    const correlationId = normaliseVerificationFieldValue(rec?.correlationId || verificationMeta?.correlationId);
    const externalRef = normaliseVerificationFieldValue(rec?.externalReferenceId);

    // ── Reusable drawing primitives ──
    const drawHeader = () => {
      // Navy header bar
      doc.setFillColor(navy.r, navy.g, navy.b);
      doc.rect(0, 0, pageW, headerH, 'F');

      // Logo (left side — native aspect 4.55:1)
      const logoH = 26;
      const logoW = logoH * 4.55;
      const logoY = 12;
      try {
        if (HELIX_LOGO_WHITE_B64) {
          doc.addImage(
            'data:image/png;base64,' + HELIX_LOGO_WHITE_B64,
            'PNG', marginL, logoY, logoW, logoH, undefined, 'FAST'
          );
        }
      } catch { /* logo embed failed — continue without */ }

      // Subtitle (below logo)
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(200, 215, 240);
      doc.text('Identity Verification Report', marginL, logoY + logoH + 14);

      // Instruction ref (right-aligned, vertically centred)
      if (currentInstructionRef) {
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(currentInstructionRef, pageW - marginR, headerH / 2 + 3, { align: 'right' });
      }
    };

    const drawFooter = (page: number, total: number) => {
      const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      doc.setFillColor(250, 250, 250);
      doc.rect(0, footerTop, pageW, footerH, 'F');
      doc.setDrawColor(243, 244, 246);
      doc.setLineWidth(0.5);
      doc.line(0, footerTop, pageW, footerTop);
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(6);
      doc.setTextColor(ftrGrey.r, ftrGrey.g, ftrGrey.b);
      doc.text('SRA Regulated  \u2022  SRA ID 565557  \u2022  Correlation-linked identity checks', marginL, footerTop + 14);
      doc.setFontSize(5);
      doc.text('\u00A9 Helix Law Limited.  helix-law.co.uk', marginL, footerTop + 24);
      doc.setFontSize(6);
      doc.text(`Page ${page} of ${total}  \u2022  ${genDate}`, pageW - marginR, footerTop + 14, { align: 'right' });
    };

    const ensureSpace = (need: number) => {
      if (y + need > footerTop - 12) {
        doc.addPage();
        drawHeader();
        y = headerH + 20;
      }
    };

    // ── Section band (light grey bar, check name left, result right) ──
    const drawSectionBand = (sectionTitle: string, result?: string) => {
      ensureSpace(28);
      doc.setFillColor(lGrey.r, lGrey.g, lGrey.b);
      doc.rect(marginL, y - 10, contentW, 20, 'F');
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(helix.r, helix.g, helix.b);
      doc.text(sectionTitle, marginL + 8, y + 3);
      if (result) {
        const rc = passFailCol(result);
        doc.setTextColor(rc.r, rc.g, rc.b);
        doc.text(result, pageW - marginR - 4, y + 3, { align: 'right' });
      }
      y += 20;
    };

    // ── Key-value row ──
    const kv = (label: string, value: string, opts?: { color?: typeof navy; bold?: boolean }) => {
      ensureSpace(14);
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(grey.r, grey.g, grey.b);
      doc.text(label, marginL + 8, y);
      const c = opts?.color || navy;
      doc.setFont(fontFamily, opts?.bold ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(c.r, c.g, c.b);
      doc.text(String(value || '\u2014'), marginL + 130, y);
      y += 13;
    };

    // ── Build page 1 ──
    drawHeader();
    y = headerH + 24;

    // Summary heading
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(helix.r, helix.g, helix.b);
    doc.text('Summary', marginL, y);
    y += 16;

    const subjectName = [title, firstName, lastName].filter(Boolean).join(' ') || verificationDetails?.clientName || '\u2014';
    kv('Name', subjectName);
    kv('Date of Birth', dob !== '\u2014' ? dob : '\u2014');
    const docType = passport !== '\u2014' ? 'Passport' : license !== '\u2014' ? 'Driving Licence' : '\u2014';
    const docNum = passport !== '\u2014' ? passport : license !== '\u2014' ? license : '\u2014';
    kv('Document', docType + (docNum !== '\u2014' ? ` (${docNum})` : ''));
    if (address) kv('Address', address);
    kv('Checked', checkedDateStr);
    if (correlationId !== '\u2014') kv('Correlation ID', correlationId);
    if (externalRef !== '\u2014') kv('External Ref', externalRef);
    if (verificationDetails?.clientEmail) kv('Email', verificationDetails.clientEmail);

    y += 6;
    kv('Overall Result', overallResult, { color: passFailCol(overallResult), bold: true });
    y += 10;

    // ── Check sections ──
    const checkLabel: Record<number, string> = { 1: 'Address Verification', 2: 'PEP & Sanctions' };

    checks.forEach((cs: any) => {
      const name = checkLabel[cs?.checkTypeId] || cs?.sourceResults?.rule || 'Verification Check';
      const result = cs?.sourceResults?.result?.result || cs?.result?.result || '\u2014';
      const checkDate = cs?.sourceResults?.date
        ? new Date(cs.sourceResults.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';

      drawSectionBand(name, result);

      if (checkDate) kv('Date', checkDate);
      const rc = cs?.resultCount;
      if (rc) {
        kv('Sources Checked', String(rc.totalSourcesChecked ?? '\u2014'));
        kv('Sources Passed', String(rc.totalSourcesPassed ?? '\u2014'), { color: green });
        if ((rc.totalSourcesFailed ?? 0) > 0) kv('Sources Failed', String(rc.totalSourcesFailed), { color: red });
      }

      // Sub-results
      const results = cs?.sourceResults?.results || [];
      results.forEach((r: any) => {
        const rTitle = r?.title || 'Result';
        const rResult = r?.result || '\u2014';
        ensureSpace(16);
        y += 2;
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(navy.r, navy.g, navy.b);
        doc.text(`${rTitle} \u2014 ${rResult}`, marginL + 8, y);
        y += 12;

        // Reasons
        const reasons = r?.detail?.reasons || [];
        reasons.forEach((reason: any) => {
          ensureSpace(20);
          doc.setFont(fontFamily, 'normal');
          doc.setFontSize(7);
          doc.setTextColor(grey.r, grey.g, grey.b);
          const line = `${reason?.key || 'Reason'}: ${reason?.reason || '\u2014'}${reason?.code && reason.code !== 'NA' ? ` (${reason.code})` : ''}`;
          const wrapped = doc.splitTextToSize(line, contentW - 20);
          wrapped.forEach((part: string) => {
            ensureSpace(10);
            doc.text(part, marginL + 14, y);
            y += 9;
          });
        });
        y += 4;
      });
      y += 6;
    });

    // ── Stamp footers on every page ──
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      drawFooter(p, pageCount);
    }

    return doc.output('blob');
  }, [
    resolveCurrentInstructionRef, verificationDetails, item, getPrimaryRawVerificationRecord, normaliseVerificationFieldValue, verificationMeta,
    eidResult, eidDate, title, firstName, lastName, dob, passport, license, address,
  ]);

  const buildRawRecordPdfBlobUrl = useCallback(() => {
    const blob = buildRawRecordPdfBlob();
    const blobUrl = URL.createObjectURL(blob);

    // Convert blob → data URI for inline embed rendering.
    // blob: URLs trigger a download in Teams webview / some browsers;
    // data:application/pdf;base64,… renders inline in <object>.
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUri = reader.result as string;
      setRawRecordPdfUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return dataUri;
      });
    };
    reader.readAsDataURL(blob);

    // Set blobUrl immediately so download functions can use the return value.
    // The state will flip to the data URI once FileReader finishes (~instant).
    setRawRecordPdfUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return blobUrl;
    });
    return blobUrl;
  }, [buildRawRecordPdfBlob]);

  const openRawRecordPdfPreview = useCallback(() => {
    buildRawRecordPdfBlobUrl();
    setShowRawRecordPdfPreview(true);
  }, [buildRawRecordPdfBlobUrl]);

  const downloadRawRecordPdf = useCallback(() => {
    const url = buildRawRecordPdfBlobUrl();
    const currentInstructionRef = resolveCurrentInstructionRef() || 'instruction';
    const fileName = `eid-raw-record-${currentInstructionRef}.pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [buildRawRecordPdfBlobUrl, resolveCurrentInstructionRef]);

  const persistRawRecordPdf = useCallback(async (source: 'manual' | 'auto' = 'manual') => {
    if (isPersistingRawRecordPdf) return;

    const instructionRef = resolveCurrentInstructionRef();
    if (!instructionRef) {
      showToast({ type: 'warning', message: 'Unable to determine instruction reference.' });
      if (source === 'auto') {
        setRawRecordSubmitState('failed');
        setRawRecordSubmitMessage('Auto-submit failed: missing instruction reference');
      }
      return;
    }

    setIsPersistingRawRecordPdf(true);
    if (source === 'auto') {
      setRawRecordSubmitState('submitting');
      setRawRecordSubmitMessage('Auto-submitting report…');
    }
    try {
      const blob = buildRawRecordPdfBlob();
      const fileName = `eid-raw-record-${instructionRef}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/documents/${encodeURIComponent(instructionRef)}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        const message = typeof err?.error === 'string' ? err.error : 'Upload failed';
        throw new Error(message);
      }

      const body = await response.json().catch(() => null);

      showToast({ type: 'success', title: 'EID Report Saved', message: 'PDF uploaded to instruction documents' });
      if (source === 'auto') {
        setRawRecordSubmitState('submitted');
        setRawRecordSubmitMessage('Report submitted');
        setRawRecordSubmittedAt(
          body && typeof body === 'object' && (body as any).uploadedAt
            ? String((body as any).uploadedAt)
            : new Date().toISOString()
        );
      }

      // Refresh documents list to show the new file
      if (fetchDocuments) {
        await fetchDocuments();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save EID report PDF';
      showToast({ type: 'error', message });
      if (source === 'auto') {
        setRawRecordSubmitState('failed');
        setRawRecordSubmitMessage(`Auto-submit failed: ${message}`);
      }
    } finally {
      setIsPersistingRawRecordPdf(false);
    }
  }, [
    isPersistingRawRecordPdf,
    buildRawRecordPdfBlob,
    resolveCurrentInstructionRef,
    showToast,
    fetchDocuments,
    setRawRecordSubmitState,
    setRawRecordSubmitMessage,
    setRawRecordSubmittedAt,
  ]);

  // Keep the ref in sync so handleTriggerEid can call it without declaration-order issues
  persistRawRecordPdfRef.current = persistRawRecordPdf;

  
  // Payment status
  const hasSuccessfulPayment = payments.some((p: any) => 
    p.payment_status === 'succeeded' || p.payment_status === 'confirmed'
  );
  const getPaymentMethodKind = (payment: any): 'card' | 'bank' | 'unknown' => {
    const methodRaw = (
      payment?.payment_method || payment?.payment_type || payment?.method || payment?.type || payment?.paymentMethod || payment?.PaymentMethod || payment?.PaymentType || ''
    ).toString().toLowerCase();
    const metadata = typeof payment?.metadata === 'object' && payment?.metadata !== null ? payment.metadata : {};
    const metaMethod = (metadata?.payment_method || metadata?.method || metadata?.paymentMethod || '').toString().toLowerCase();
    const intentId = (payment?.payment_intent_id || payment?.paymentIntentId || '').toString();
    const combined = methodRaw || metaMethod;

    if (combined.includes('bank') || combined.includes('transfer') || combined.includes('bacs') || combined.includes('ach') || intentId.startsWith('bank_')) {
      return 'bank';
    }
    if (combined.includes('card') || combined.includes('stripe') || combined === 'cc' || intentId.startsWith('pi_')) {
      return 'card';
    }
    return 'unknown';
  };
  const successfulPayments = payments.filter((p: any) => p.payment_status === 'succeeded' || p.payment_status === 'confirmed');
  const hasSuccessfulBankPayment = successfulPayments.some((p: any) => getPaymentMethodKind(p) === 'bank');
  const hasSuccessfulCardPayment = successfulPayments.some((p: any) => getPaymentMethodKind(p) === 'card');
  const hasFailedPayment = payments.some((p: any) => 
    p.payment_status === 'failed' || p.internal_status === 'failed'
  );
  const totalPaid = payments.filter((p: any) => p.payment_status === 'succeeded' || p.payment_status === 'confirmed')
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  
  // Risk status
  const riskScore = risk?.RiskScore;
  const riskComplete = !!risk?.RiskAssessmentResult;
  const isHighRisk = risk?.RiskAssessmentResult?.toLowerCase().includes('high');
  const isMediumRisk = risk?.RiskAssessmentResult?.toLowerCase().includes('medium');
  const riskLevel = risk?.TransactionRiskLevel || '—';
  const riskAssessor = risk?.RiskAssessor || '—';
  const sourceOfFunds = risk?.SourceOfFunds || '—';
  const sourceOfWealth = risk?.SourceOfWealth || '—';
  const riskResult = risk?.RiskAssessmentResult || '—';
  const complianceDate = risk?.ComplianceDate 
    ? new Date(risk.ComplianceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  // ComplianceDate is DATE type in DB (no time stored), so just use date format
  const complianceDateTime = complianceDate !== '—' ? complianceDate : null;
  const firmWideAMLConsidered = risk?.FirmWideAMLPolicyConsidered;
  const firmWideSanctionsConsidered = risk?.FirmWideSanctionsRiskConsidered;
  const clientRiskConsidered = risk?.ClientRiskConsidered || risk?.ClientRiskFactorsConsidered;
  const transactionRiskConsidered = risk?.TransactionRiskConsidered || risk?.TransactionRiskFactorsConsidered;
  // Additional risk fields
  const riskClientType = risk?.ClientType || '—';
  const howIntroduced = risk?.HowWasClientIntroduced || '—';
  const jurisdiction = risk?.Jurisdiction || inst?.Country || '—';
  const destinationOfFunds = risk?.DestinationOfFunds || '—';
  const fundsType = risk?.FundsType || '—';
  const valueOfInstruction = risk?.ValueOfInstruction || '—';
  const limitationPeriod = risk?.Limitation || '—';
  
  // ── Inline risk assessment form state ──────────────────────────────
  const [inlineRiskCore, setInlineRiskCore] = useState<RiskCore>({
    clientType: risk?.ClientType ?? '',
    clientTypeValue: risk?.ClientType_Value ?? 0,
    destinationOfFunds: risk?.DestinationOfFunds ?? '',
    destinationOfFundsValue: risk?.DestinationOfFunds_Value ?? 0,
    fundsType: risk?.FundsType ?? '',
    fundsTypeValue: risk?.FundsType_Value ?? 0,
    clientIntroduced: risk?.HowWasClientIntroduced ?? '',
    clientIntroducedValue: risk?.HowWasClientIntroduced_Value ?? 0,
    limitation: risk?.Limitation ?? '',
    limitationValue: risk?.Limitation_Value ?? 0,
    sourceOfFunds: risk?.SourceOfFunds ?? '',
    sourceOfFundsValue: risk?.SourceOfFunds_Value ?? 0,
    valueOfInstruction: risk?.ValueOfInstruction ?? '',
    valueOfInstructionValue: risk?.ValueOfInstruction_Value ?? 0,
  });
  const [inlineLimitationDate, setInlineLimitationDate] = useState<Date | undefined>();
  const [inlineLimitationDateTbc, setInlineLimitationDateTbc] = useState(false);
  const [inlineConsideredClientRisk, setInlineConsideredClientRisk] = useState<boolean | undefined>(
    risk?.ClientRiskFactorsConsidered !== undefined ? !!risk?.ClientRiskFactorsConsidered : undefined,
  );
  const [inlineConsideredTransactionRisk, setInlineConsideredTransactionRisk] = useState<boolean | undefined>(
    risk?.TransactionRiskFactorsConsidered !== undefined ? !!risk?.TransactionRiskFactorsConsidered : undefined,
  );
  const [inlineTransactionRiskLevel, setInlineTransactionRiskLevel] = useState(
    risk?.TransactionRiskLevel ?? '',
  );
  const [inlineConsideredFirmWideSanctions, setInlineConsideredFirmWideSanctions] = useState<boolean | undefined>(
    risk?.FirmWideSanctionsRiskConsidered !== undefined ? !!risk?.FirmWideSanctionsRiskConsidered : undefined,
  );
  const [inlineConsideredFirmWideAML, setInlineConsideredFirmWideAML] = useState<boolean | undefined>(
    risk?.FirmWideAMLPolicyConsidered !== undefined ? !!risk?.FirmWideAMLPolicyConsidered : undefined,
  );
  const [isRiskSubmitting, setIsRiskSubmitting] = useState(false);

  const isInlineRiskComplete = useCallback(() =>
    Object.values(inlineRiskCore).every((v) => v !== '' && v !== 0) &&
    inlineConsideredClientRisk === true &&
    inlineConsideredTransactionRisk === true &&
    (inlineConsideredTransactionRisk ? inlineTransactionRiskLevel !== '' : true) &&
    inlineConsideredFirmWideSanctions === true &&
    inlineConsideredFirmWideAML === true &&
    (inlineRiskCore.limitationValue === 1 || inlineLimitationDateTbc || !!inlineLimitationDate),
  [inlineRiskCore, inlineConsideredClientRisk, inlineConsideredTransactionRisk, inlineTransactionRiskLevel, inlineConsideredFirmWideSanctions, inlineConsideredFirmWideAML, inlineLimitationDate, inlineLimitationDateTbc]);

  const handleInlineRiskSubmit = useCallback(async () => {
    if (!isInlineRiskComplete() || isRiskSubmitting) return;
    setIsRiskSubmitting(true);
    try {
      const score =
        inlineRiskCore.clientTypeValue +
        inlineRiskCore.destinationOfFundsValue +
        inlineRiskCore.fundsTypeValue +
        inlineRiskCore.clientIntroducedValue +
        inlineRiskCore.limitationValue +
        inlineRiskCore.sourceOfFundsValue +
        inlineRiskCore.valueOfInstructionValue;

      let result = 'Low Risk';
      if (inlineRiskCore.limitationValue === 3 || score >= 16) result = 'High Risk';
      else if (score >= 11) result = 'Medium Risk';

      const compDate = new Date();
      const compExpiry = new Date(compDate.getTime());
      compExpiry.setMonth(compExpiry.getMonth() + 6);

      let limitationText = inlineRiskCore.limitation;
      if ([2, 3].includes(inlineRiskCore.limitationValue)) {
        const datePart = inlineLimitationDateTbc ? 'TBC' : inlineLimitationDate ? inlineLimitationDate.toLocaleDateString('en-GB') : '';
        if (datePart) limitationText += ` - ${datePart}`;
      }

      const ref = inst?.InstructionRef || inst?.instructionRef || instructionRef || '';
      const payload = {
        MatterId: ref,
        InstructionRef: ref,
        RiskAssessor: currentUser?.FullName || 'Unknown',
        ComplianceDate: compDate.toISOString().split('T')[0],
        ComplianceExpiry: compExpiry.toISOString().split('T')[0],
        ClientType: inlineRiskCore.clientType,
        ClientType_Value: inlineRiskCore.clientTypeValue,
        DestinationOfFunds: inlineRiskCore.destinationOfFunds,
        DestinationOfFunds_Value: inlineRiskCore.destinationOfFundsValue,
        FundsType: inlineRiskCore.fundsType,
        FundsType_Value: inlineRiskCore.fundsTypeValue,
        HowWasClientIntroduced: inlineRiskCore.clientIntroduced,
        HowWasClientIntroduced_Value: inlineRiskCore.clientIntroducedValue,
        Limitation: limitationText,
        Limitation_Value: inlineRiskCore.limitationValue,
        LimitationDate: inlineLimitationDate ? inlineLimitationDate.toISOString() : null,
        LimitationDateTbc: inlineLimitationDateTbc,
        SourceOfFunds: inlineRiskCore.sourceOfFunds,
        SourceOfFunds_Value: inlineRiskCore.sourceOfFundsValue,
        ValueOfInstruction: inlineRiskCore.valueOfInstruction,
        ValueOfInstruction_Value: inlineRiskCore.valueOfInstructionValue,
        TransactionRiskLevel: inlineTransactionRiskLevel,
        ClientRiskFactorsConsidered: inlineConsideredClientRisk,
        TransactionRiskFactorsConsidered: inlineConsideredTransactionRisk,
        FirmWideSanctionsRiskConsidered: inlineConsideredFirmWideSanctions,
        FirmWideAMLPolicyConsidered: inlineConsideredFirmWideAML,
        RiskScore: score,
        RiskScoreIncrementBy: score,
        RiskAssessmentResult: result,
      };

      const response = await fetch('/api/risk-assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`API call failed: ${response.status}`);

      if (onRiskAssessmentSave) { try { await onRiskAssessmentSave(payload); } catch { /* silent */ } }
      if (onRefreshData) { try { await onRefreshData?.(instructionRef); } catch { /* silent */ } }

      showToast({ type: 'success', title: 'Risk Assessment Saved', message: `Result: ${result}` });
      setRiskEditMode(false);
    } catch (err) {
      console.error('❌ Risk assessment submit failed', err);
      showToast({ type: 'error', message: 'Failed to save risk assessment' });
    } finally {
      setIsRiskSubmitting(false);
    }
  }, [isInlineRiskComplete, isRiskSubmitting, inlineRiskCore, inlineLimitationDate, inlineLimitationDateTbc, inlineTransactionRiskLevel, inlineConsideredClientRisk, inlineConsideredTransactionRisk, inlineConsideredFirmWideSanctions, inlineConsideredFirmWideAML, inst, instructionRef, currentUser, onRiskAssessmentSave, onRefreshData, showToast]);

  // Matter status - prioritize matter object from Matters table ("new space")
  const hasMatter = !!(matter || inst?.MatterId || inst?.MatterRef || inst?.DisplayNumber);
  const matterRef = matter?.DisplayNumber || matter?.['Display Number'] || matter?.display_number || inst?.MatterRef || inst?.DisplayNumber || inst?.MatterId || '—';
  const matterStatus = matter?.Status || matter?.status || inst?.MatterStatus || inst?.Stage || '—';
  const matterDescription = matter?.Description || matter?.description || inst?.MatterDescription || getValue(['Description', 'description', 'MatterDescription']) || '—';
  const matterClientName = matter?.ClientName || matter?.['Client Name'] || matter?.client_name || inst?.ClientName || getValue(['ClientName', 'Client Name']) || '—';
  const matterPracticeArea = matter?.PracticeArea || matter?.['Practice Area'] || matter?.practice_area || inst?.PracticeArea || getValue(['PracticeArea', 'practice_area', 'Area']) || areaOfWork;
  const matterResponsibleSolicitor = matter?.ResponsibleSolicitor || matter?.['Responsible Solicitor'] || matter?.responsible_solicitor || inst?.ResponsibleSolicitor || getValue(['ResponsibleSolicitor']) || '—';
  const matterOriginatingSolicitor = matter?.OriginatingSolicitor || matter?.['Originating Solicitor'] || matter?.originating_solicitor || inst?.OriginatingSolicitor || getValue(['OriginatingSolicitor']) || '—';
  const matterValue = matter?.ApproxValue || matter?.['Approx Value'] || matter?.approx_value || inst?.ApproxValue || getValue(['ApproxValue', 'MatterValue']) || '—';
  const matterClioId = matter?.MatterID || matter?.matter_id || matter?.['Unique ID'] || matter?.UniqueID || inst?.MatterId || '—';
  const matterInstructionRef = matter?.InstructionRef || matter?.instruction_ref || matter?.['Instruction Ref'] || inst?.InstructionRef || instructionRef || '—';
  const matterClientId = matter?.ClientID || matter?.ClientId || matter?.client_id || inst?.ClientId || inst?.ClientID || getValue(['ClientId', 'ClientID', 'client_id']) || '—';
  const matterClientType = matter?.ClientType || matter?.client_type || inst?.ClientType || getValue(['ClientType', 'client_type']) || '—';
  const matterClientEmail = matter?.ClientEmail || matter?.client_email || inst?.Email || getValue(['Email', 'email', 'ClientEmail']) || '—';
  const matterClientPhone = matter?.ClientPhone || matter?.client_phone || inst?.Phone || getValue(['Phone', 'phone', 'ClientPhone']) || '—';
  const matterClientCompany = matter?.ClientCompany || matter?.client_company || inst?.CompanyName || getValue(['CompanyName', 'Company']) || '—';
  const matterOpenMethod = matter?.OpenMethod || matter?.open_method || matter?.OpeningMethod || matter?.opening_method || '—';
  const feeEarner = matter?.ResponsibleSolicitor || matter?.['Responsible Solicitor'] || getValue(['HelixContact', 'FeeEarner', 'feeEarner', 'ResponsibleSolicitor']);
  const matterOpenedBy = matter?.OpenedBy || matter?.opened_by || matter?.CreatedBy || matter?.created_by || matterResponsibleSolicitor || feeEarner || '—';
  const matterOpenedByDisplay = String(matterOpenedBy || '').trim() || '—';
  const matterOpenTimestampRaw = matter?.OpenedAt || matter?.opened_at || matter?.CreatedAt || matter?.created_at || matter?.OpenDate || matter?.['Open Date'] || null;
  const matterPortalPasscode = matterClientId && matterClientId !== '—'
    ? String(matterClientId).trim()
    : (deal?.Passcode || deal?.passcode || inst?.Passcode || inst?.passcode || '');
  const matterPortalOpened = Boolean(hasMatter && matterPortalPasscode);
  const matterSupervisingPartner = matter?.SupervisingPartner || matter?.['Supervising Partner'] || matter?.supervising_partner || '—';
  const matterOpenTrail = [
    { label: 'Opened On', value: matterOpenDate !== '—' ? matterOpenDate : null },
    { label: 'Opened By', value: matterOpenedByDisplay !== '—' ? matterOpenedByDisplay : null },
    { label: 'Method', value: matterOpenMethod !== '—' ? matterOpenMethod : null },
    { label: 'Responsible', value: matterResponsibleSolicitor !== '—' ? matterResponsibleSolicitor : null },
    { label: 'Originating', value: matterOriginatingSolicitor !== '—' ? matterOriginatingSolicitor : null },
    { label: 'Supervising', value: matterSupervisingPartner !== '—' ? matterSupervisingPartner : null },
  ].filter(item => item.value);
  const matterReferrer = matter?.Referrer || matter?.referrer || '—';
  const matterSourceDisplay = !isPlaceholderSource(matterSource) ? String(matterSource) : '—';
  const matterCloseDateRaw = matter?.CloseDate || matter?.['Close Date'] || matter?.close_date || matter?.closed_at || null;
  const matterCloseDate = formatDate(matterCloseDateRaw);
  const isMatterClosed = /closed|complete|completed/i.test(String(matterStatus || ''));
  const instructionStage = String(inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.stage ?? '').trim();
  const isInstructionInitialised = /initiali[sz]ed/i.test(instructionStage);

  // Look up fee earner email from teamData
  const feeEarnerEmail = useMemo(() => {
    if (!teamData || !feeEarner || feeEarner === '—') return '';
    const match = teamData.find((t) => 
      t['Full Name']?.toLowerCase() === feeEarner.toLowerCase() ||
      t['Nickname']?.toLowerCase() === feeEarner.toLowerCase() ||
      t['Initials']?.toLowerCase() === feeEarner.toLowerCase()
    );
    return match?.['Email'] || '';
  }, [teamData, feeEarner]);

  const colleagueEmailOptions = useMemo(() => {
    if (!teamData || teamData.length === 0) return [] as Array<{ email: string; label: string }>;

    const getEmail = (member: any): string => {
      const email = (member?.Email || member?.email || member?.WorkEmail || member?.Mail || member?.UserPrincipalName || member?.['Email Address'] || member?.['Email'] || '').trim();
      return email;
    };

    const getName = (member: any): string => {
      const name = (
        member?.['Full Name'] ||
        member?.FullName ||
        member?.fullName ||
        [member?.First, member?.Last].filter(Boolean).join(' ') ||
        [member?.first, member?.last].filter(Boolean).join(' ') ||
        member?.Nickname ||
        member?.Initials ||
        ''
      );
      return String(name || '').trim();
    };

    const isActive = (member: any): boolean => {
      const status = String(member?.status || member?.Status || '').trim().toLowerCase();
      if (!status) return true;
      return status === 'active';
    };

    return teamData
      .filter((m: any) => {
        const email = getEmail(m);
        if (!email || !email.includes('@')) return false;
        if (email.toLowerCase().includes('team@')) return false;
        return isActive(m);
      })
      .map((m: any) => {
        const email = getEmail(m);
        const name = getName(m) || email;
        return { email, label: `${name} (${email})` };
      })
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  }, [teamData]);

  // Normalised identity stage status (prefer pipeline status when provided)
  const identityStatus: StageStatus = (stageStatuses?.id || (
    eidStatus === 'verified' ? 'complete' : (eidStatus === 'failed' || eidStatus === 'review') ? 'review' : 'pending'
  )) as StageStatus;

  // Normalised per-tab statuses (prefer pipeline stageStatuses)
  const paymentStatus: StageStatus = (stageStatuses?.payment || (hasSuccessfulPayment ? 'complete' : hasFailedPayment ? 'review' : 'pending')) as StageStatus;
  const riskStatus: StageStatus = (stageStatuses?.risk || (riskComplete ? ((isHighRisk || isMediumRisk) ? 'review' : 'complete') : 'pending')) as StageStatus;
  const matterStageStatus: StageStatus = (stageStatuses?.matter || (hasMatter ? 'complete' : 'pending')) as StageStatus;
  const documentStatus: StageStatus = (stageStatuses?.documents || (documents.length > 0 ? 'complete' : 'neutral')) as StageStatus;

  // Banner status safety: only show complete/blue when we have concrete evidence in this record.
  const identityBannerStatus: StageStatus =
    identityStatus === 'complete' && !(hasId || eidStatus === 'verified' || isManuallyApproved)
      ? 'pending'
      : identityStatus;
  const paymentBannerStatus: StageStatus =
    paymentStatus === 'complete' && !hasSuccessfulPayment
      ? 'pending'
      : paymentStatus;
  const riskBannerStatus: StageStatus =
    riskStatus === 'complete' && !riskComplete
      ? 'pending'
      : riskStatus;
  const matterBannerStatus: StageStatus =
    matterStageStatus === 'complete' && !hasMatter
      ? 'pending'
      : matterStageStatus;
  const documentBannerStatus: StageStatus =
    documentStatus === 'complete' && documents.length === 0
      ? 'neutral'
      : documentStatus;

  const getStatusColors = React.useCallback((status: StageStatus) => {
    if (status === 'complete') return { 
      bg: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
      border: colours.highlight,
      text: colours.highlight
    };
    if (status === 'review') return {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
      border: '#D65541',
      text: '#D65541'
    };
    if (status === 'processing') return {
      bg: isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.08)',
      border: '#f59e0b',
      text: '#f59e0b'
    };
    if (status === 'neutral') return {
      bg: isDarkMode ? `${colours.subtleGrey}0f` : `${colours.subtleGrey}0d`,
      border: isDarkMode ? colours.dark.border : `${colours.subtleGrey}29`,
      text: isDarkMode ? colours.subtleGrey : colours.greyText
    };
    return {
      bg: isDarkMode ? `${colours.subtleGrey}14` : `${colours.subtleGrey}0f`,
      border: isDarkMode ? colours.dark.border : `${colours.subtleGrey}38`,
      text: isDarkMode ? colours.subtleGrey : colours.greyText
    };
  }, [isDarkMode]);

  const renderStatusBanner = (
    title: string,
    status: StageStatus,
    prompt: string,
    icon: React.ReactNode,
    action?: React.ReactNode,
  ) => {
    const colors = getStatusColors(status);
    const headerCueColor = isDarkMode && status === 'complete' ? colours.accent : colors.text;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: flatEmbedMode ? '6px 0' : '8px 14px',
        background: flatEmbedMode ? 'transparent' : colors.bg,
        border: flatEmbedMode ? 'none' : `1px solid ${colors.border}`,
        borderRadius: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: headerCueColor, display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: headerCueColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.78)', marginLeft: 4 }}>{prompt}</span>
        </div>
        {action && <div>{action}</div>}
      </div>
    );
  };

  const isInstructedComplete = Boolean(submissionDateRaw && submissionDateRaw !== '—');
  const instructedStatus: StageStatus = isInstructedComplete
    ? 'complete'
    : (isInstructionInitialised ? 'complete' : 'pending');

  // Timeline stages - unified navigation: Enquiry ? Pitch ? Instructed ? ID ? Pay ? Risk ? Matter ? Docs
  // Combines the old tabs with the timeline concept - clickable stages that also show completion
  const timelineStages = useMemo(() => {
    return [
      { 
        key: 'enquiry' as const,
        label: 'Enquiry', 
        icon: <FaEnvelope size={10} />,
        date: null, // No specific date shown
        dateRaw: null,
        isComplete: !!prospectId, // Has linked enquiry
        hasIssue: false,
        status: (prospectId ? 'complete' : 'neutral') as StageStatus,
        navigatesTo: 'external' as const, // Special: navigates to Enquiries tab
        externalAction: () => {
          if (prospectId) {
            localStorage.setItem('navigateToEnquiryId', String(prospectId));
            window.dispatchEvent(new CustomEvent('navigateToEnquiries'));
          }
        },
      },
      { 
        key: 'pitch' as const,
        label: 'Pitch', 
        icon: <FaUser size={10} />,
        date: pitchDate !== '—' ? pitchDate : null,
        dateRaw: pitchDateRaw,
        isComplete: !!pitchDateRaw,
        hasIssue: false,
        status: (pitchDateRaw ? 'complete' : 'pending') as StageStatus,
        navigatesTo: 'details' as WorkbenchTab,
      },
      { 
        key: 'instructed' as const,
        label: 'Instruction', 
        icon: <FaFileAlt size={10} />,
        date: submissionDate !== '—' ? submissionDate : null,
        dateRaw: submissionDateRaw,
        isComplete: isInstructedComplete,
        hasIssue: false,
        status: instructedStatus,
        navigatesTo: 'details' as WorkbenchTab,
      },
      { 
        key: 'payment' as const,
        label: 'Pay', 
        icon: <FaCreditCard size={10} />,
        date: paymentDate !== '—' ? paymentDate : null,
        dateRaw: paymentDateRaw,
        isComplete: hasSuccessfulPayment,
        hasIssue: hasFailedPayment,
        status: (stageStatuses?.payment || (hasSuccessfulPayment ? 'complete' : hasFailedPayment ? 'review' : 'pending')) as StageStatus,
        navigatesTo: 'payment' as WorkbenchTab,
      },
      { 
        key: 'identity' as const,
        label: eidProcessingState === 'processing' ? 'ID Check' : 'ID', 
        icon: <FaIdCard size={10} />,
        date: null, // No specific date for ID
        dateRaw: null,
        isComplete: hasId || eidStatus === 'verified',
        hasIssue: eidStatus === 'failed' || eidStatus === 'review',
        status: (eidProcessingState === 'processing' ? 'processing' : stageStatuses?.id || (eidStatus === 'verified' ? 'complete' : (eidStatus === 'failed' || eidStatus === 'review') ? 'review' : 'pending')) as StageStatus,
        navigatesTo: 'identity' as WorkbenchTab,
      },
      { 
        key: 'risk' as const,
        label: 'Risk', 
        icon: <FaShieldAlt size={10} />,
        date: null,
        dateRaw: null,
        isComplete: riskComplete && !isHighRisk && !isMediumRisk,
        hasIssue: isHighRisk || isMediumRisk,
        status: (riskEditMode ? 'processing' : stageStatuses?.risk || (riskComplete ? ((isHighRisk || isMediumRisk) ? 'review' : 'complete') : 'pending')) as StageStatus,
        navigatesTo: 'risk' as WorkbenchTab,
      },
      { 
        key: 'matter' as const,
        label: 'Matter', 
        icon: hasMatter ? <FaFolderOpen size={10} /> : <FaRegFolder size={10} />,
        date: matterOpenDate !== '—' ? matterOpenDate : null,
        dateRaw: matterOpenDateRaw,
        isComplete: hasMatter,
        hasIssue: false,
        status: (showLocalMatterModal ? 'processing' : stageStatuses?.matter || (hasMatter ? 'complete' : 'pending')) as StageStatus,
        navigatesTo: 'matter' as WorkbenchTab,
      },
      { 
        key: 'documents' as const,
        label: 'Docs', 
        icon: <FaFolder size={10} />,
        date: firstDocUploadDate || null,
        dateRaw: firstDocUploadDateRaw,
        isComplete: documents.length > 0,
        hasIssue: false,
        count: documents.length,
        status: (stageStatuses?.documents || (documents.length > 0 ? 'complete' : 'neutral')) as StageStatus,
        navigatesTo: 'documents' as WorkbenchTab,
      },
    ];
  }, [prospectId, hasId, eidStatus, eidProcessingState, hasSuccessfulPayment, hasFailedPayment, documents.length, riskComplete, isHighRisk, isMediumRisk, riskEditMode, showLocalMatterModal, hasMatter, stageStatuses, pitchDate, pitchDateRaw, submissionDate, submissionDateRaw, paymentDate, paymentDateRaw, matterOpenDate, matterOpenDateRaw, firstDocUploadDate, firstDocUploadDateRaw, isInstructedComplete, instructedStatus]);

  const contextStageKeyList = useMemo(() => {
    // If context stage chips disabled, don't show any context stages
    if (!enableContextStageChips) return [] as ContextStageKey[];
    // Otherwise use provided keys or default to all
    return contextStageKeys && contextStageKeys.length > 0
      ? contextStageKeys
      : (['enquiry', 'pitch', 'instructed'] as ContextStageKey[]);
  }, [enableContextStageChips, contextStageKeys?.join('|')]);

  const pipelineStages = useMemo(() => {
    const allowedContextStages = new Set(contextStageKeyList);
    return timelineStages.filter((stage) => {
      if (['enquiry', 'pitch', 'instructed'].includes(stage.key)) {
        return allowedContextStages.has(stage.key as ContextStageKey);
      }
      if (!enableTabStages) return false;
      return true;
    });
  }, [timelineStages, contextStageKeyList, enableTabStages]);

  const openEnquiryFromContext = React.useCallback(() => {
    const enquiryStage = timelineStages.find(s => s.key === 'enquiry') as any;
    const externalAction = enquiryStage?.externalAction as (() => void) | undefined;
    if (typeof externalAction === 'function') externalAction();
  }, [timelineStages]);

  // Legacy tabs array for compatibility (maps from timeline stages)
  const tabs = useMemo(() => timelineStages.filter(s => s.navigatesTo === s.key || ['identity', 'payment', 'risk', 'matter', 'documents'].includes(s.key)).map(s => ({
    key: s.navigatesTo,
    label: s.label,
    icon: s.icon,
    isComplete: s.isComplete,
    hasIssue: s.hasIssue,
    status: s.status,
    count: (s as any).count,
  })), [timelineStages]);

  const isTabbedContent = ['identity', 'payment', 'risk', 'matter', 'documents'].includes(activeTab);
  const headerCueAccent = isDarkMode ? colours.accent : colours.highlight;

  // Palette helper for tab/timeline statuses
  const getStagePalette = (stage: (typeof timelineStages)[number]) => {
    if (stage.status === 'complete') return { 
      bg: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
      border: isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.3)',
      text: colours.green,
      line: colours.green,
    };
    if (stage.status === 'review') return {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
      border: isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.35)',
      text: '#D65541',
      line: '#D65541',
    };
    if (stage.status === 'processing') return {
      bg: isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
      border: isDarkMode ? 'rgba(251, 191, 36, 0.4)' : 'rgba(251, 191, 36, 0.35)',
      text: '#f59e0b',
      line: '#f59e0b',
    };
    return {
      bg: isDarkMode ? `${colours.subtleGrey}0f` : `${colours.subtleGrey}0d`,
      border: isDarkMode ? colours.dark.border : `${colours.subtleGrey}26`,
      text: isDarkMode ? colours.subtleGrey : colours.greyText,
      line: isDarkMode ? colours.dark.border : `${colours.subtleGrey}26`,
    };
  };

  const activeStage = timelineStages.find(s => ['identity', 'payment', 'risk', 'matter', 'documents'].includes(s.key) && s.navigatesTo === activeTab) || null;
  const activePalette = activeStage ? getStagePalette(activeStage) : null;
  
  // Revised Active Design: High contrast, brand-led
  const activeTabPalette = {
    bg: isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(54, 144, 206, 0.1)',
    border: 'transparent', // We use the bottom line for focus, border is distracting
    line: colours.highlight,
    text: colours.highlight,
    shadow: isDarkMode 
      ? `inset 0 -3px 0 ${colours.highlight}, 0 4px 12px rgba(0,0,0,0.3)`
      : `inset 0 -3px 0 ${colours.highlight}, 0 4px 12px rgba(54, 144, 206, 0.15)`,
  };
  
  const tabBasePalette = {
    bg: isDarkMode ? `${colours.subtleGrey}08` : `${colours.subtleGrey}0a`,
    border: isDarkMode ? colours.dark.border : `${colours.subtleGrey}1f`,
    text: isDarkMode ? colours.subtleGrey : colours.greyText,
  };

  // Stop all click events from bubbling up to the row (which toggles expansion)
  const handleWorkbenchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Create payment link handler
  const handleCreatePaymentLink = async () => {
    const instructionRefToUse = (deal?.instructionRef || deal?.instruction_ref || instructionRef || '').toString().trim();
    if (!instructionRefToUse) {
      showToast({ type: 'error', message: 'Missing instruction reference for payment link' });
      return;
    }

    const netAmount = parseFloat(paymentLinkAmount);
    if (Number.isNaN(netAmount) || netAmount < 1) {
      showToast({ type: 'warning', message: 'Please enter a valid amount (at least —1)' });
      return;
    }

    const amountToCharge = paymentLinkIncludesVat
      ? Math.round(netAmount * 1.2 * 100) / 100
      : Math.round(netAmount * 100) / 100;

    const baseDescription = paymentLinkDescription || `Payment for ${deal?.instructionRef || deal?.instruction_ref || 'instruction'}`;
    const description = paymentLinkIncludesVat ? `${baseDescription} (incl VAT)` : baseDescription;

    setIsCreatingPaymentLink(true);
    setCreatedPaymentLink(null);

    try {
      const response = await fetch('/api/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToCharge,
          instructionRef: instructionRefToUse,
          description,
          currency: 'gbp',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        const message = errorData?.details
          ? `${errorData.error || 'Failed to create payment link'}: ${errorData.details}`
          : (errorData.error || 'Failed to create payment link');
        throw new Error(message);
      }

      const data = await response.json();
      setCreatedPaymentLink(data.paymentLinkUrl);
      showToast({ type: 'success', title: 'Payment Link Created', message: 'Link ready to copy and share' });
    } catch (err: any) {
      console.error('Error creating payment link:', err);
      showToast({ type: 'error', message: err.message || 'Failed to create payment link' });
    } finally {
      setIsCreatingPaymentLink(false);
    }
  };

  // Status pill
  const StatusPill = ({ status, label }: { status: 'pass' | 'fail' | 'pending' | 'warn'; label: string }) => {
    const bg = status === 'pass' ? `${colours.highlight}1f` 
      : status === 'fail' ? 'rgba(239, 68, 68, 0.12)'
      : status === 'warn' ? 'rgba(239, 68, 68, 0.12)'
      : (isDarkMode ? `${colours.subtleGrey}1a` : `${colours.subtleGrey}14`);
    const color = status === 'pass' ? colours.highlight 
      : status === 'fail' ? colours.cta
      : status === 'warn' ? colours.cta
      : (isDarkMode ? colours.subtleGrey : colours.greyText);
    return (
      <span style={{
        fontSize: 9,
        padding: '3px 8px',
        borderRadius: 0,
        background: bg,
        color,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
      }}>
        {label}
      </span>
    );
  };

  // Payment Journey Step component - matches pipeline chip style
  const JourneyStep = ({ label, isActive, isComplete }: { label: string; isActive: boolean; isComplete: boolean }) => {
    const getColors = () => {
      // Complete steps (including when active AND complete) show blue
      if (isComplete || (isActive && label === 'Succeeded')) return { 
        bg: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
        border: colours.highlight,
        text: colours.highlight
      };
      // Active but not complete (e.g. requires_action) shows amber
      if (isActive) return {
        bg: isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
        border: '#f59e0b',
        text: '#f59e0b'
      };
      return {
        bg: isDarkMode ? `${colours.subtleGrey}1a` : `${colours.subtleGrey}14`,
        border: isDarkMode ? colours.dark.borderColor : `${colours.subtleGrey}40`,
        text: isDarkMode ? colours.subtleGrey : colours.greyText
      };
    };
    const colors = getColors();
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: 0,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 9,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
      }}>
        {label}
      </span>
    );
  };

  // Bank Payment Confirmation Component - for manual date entry
  const BankPaymentConfirmation = ({
    paymentId,
    isDarkMode,
    onConfirm,
  }: {
    paymentId: string;
    isDarkMode: boolean;
    onConfirm: (paymentId: string, confirmedDate: string) => void | Promise<void>;
  }) => {
    const [confirmDate, setConfirmDate] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);

    const handleConfirm = async () => {
      if (!confirmDate) return;
      setIsConfirming(true);
      try {
        await onConfirm(paymentId, confirmDate);
      } finally {
        setIsConfirming(false);
      }
    };

    return (
      <div style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
        border: `1px dashed ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
        borderRadius: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 8 }}>
          <FaBuilding size={10} /> Confirm Bank Payment
        </div>
        <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(243, 244, 246, 0.7)' : 'rgba(6, 23, 51, 0.65)', marginBottom: 10, lineHeight: 1.4 }}>
          Bank transfer received? Enter the date from your statement to confirm.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date"
            value={confirmDate}
            onChange={(e) => setConfirmDate(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              padding: '6px 10px',
              background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : '#ffffff',
              border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(0, 0, 0, 0.1)'}`,
              borderRadius: 0,
              fontSize: 11,
              color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            disabled={!confirmDate || isConfirming}
            onClick={(e) => { e.stopPropagation(); void handleConfirm(); }}
            style={{
              padding: '6px 14px',
              background: confirmDate ? colours.highlight : (isDarkMode ? `${colours.subtleGrey}26` : 'rgba(0, 0, 0, 0.08)'),
              color: confirmDate ? '#ffffff' : (isDarkMode ? colours.subtleGrey : colours.greyText),
              border: 'none',
              borderRadius: 0,
              fontSize: 10,
              fontWeight: 700,
              cursor: confirmDate && !isConfirming ? 'pointer' : 'default',
              opacity: isConfirming ? 0.7 : 1,
            }}
          >
            {isConfirming ? 'Saving—' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  };

  // Rich Payment Tab Content
  const PaymentTabContent = ({ 
    payments, 
    deal, 
    totalPaid, 
    instructionRef,
    isDarkMode,
    expandedPayment,
    setExpandedPayment,
    onConfirmBankPayment,
    onRequestPaymentLink,
  }: { 
    payments: any[]; 
    deal: any; 
    totalPaid: number;
    instructionRef: string;
    isDarkMode: boolean;
    expandedPayment: string | null;
    setExpandedPayment: (id: string | null) => void;
    onConfirmBankPayment?: (paymentId: string, confirmedDate: string) => void | Promise<void>;
    onRequestPaymentLink?: () => void;
  }) => {
    const activePayments = payments.filter((p: any) => !p.archived && !p.deleted);
    const isLocalEnv = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const dealAmount = Number(deal?.Amount || deal?.amount || 0);
    const paymentCount = activePayments.length;
    const successCount = activePayments.filter((p: any) => p.payment_status === 'succeeded' || p.payment_status === 'confirmed').length;
    const successfulPayments = activePayments.filter((p: any) => p.payment_status === 'succeeded' || p.payment_status === 'confirmed');
    const lastPayment = activePayments.length > 0 ? activePayments[activePayments.length - 1] : null;
    const lastPaymentDate = lastPayment?.created_at || lastPayment?.date || lastPayment?.payment_date;
    const formattedLastDate = lastPaymentDate
      ? new Date(lastPaymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '\u2014';
    const lastSuccessfulPayment = successfulPayments.length > 0 ? successfulPayments[successfulPayments.length - 1] : null;
    const lastSuccessfulPaymentDateRaw = lastSuccessfulPayment?.created_at || lastSuccessfulPayment?.date || lastSuccessfulPayment?.payment_date;
    const formattedPaidTimestamp = lastSuccessfulPaymentDateRaw
      ? new Date(lastSuccessfulPaymentDateRaw).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const allSuccess = successCount === paymentCount && paymentCount > 0;
    const anyFailed = activePayments.some((p: any) => p.payment_status === 'failed');
    const showPerPaymentStatusPills = !(paymentCount === 1 && allSuccess);

    // Derive overall method from payments
    const hasCard = activePayments.some((p: any) => {
      const m = (p.payment_method || p.method || p.type || '').toString().toLowerCase();
      const iid = (p.payment_intent_id || '').toString();
      return m.includes('card') || m.includes('stripe') || iid.startsWith('pi_');
    });
    const hasBank = activePayments.some((p: any) => {
      const m = (p.payment_method || p.method || p.type || '').toString().toLowerCase();
      const iid = (p.payment_intent_id || '').toString();
      return m.includes('bank') || m.includes('transfer') || m.includes('bacs') || iid.startsWith('bank_');
    });

    // Colour helper for border separator
    const sep = isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral || 'rgba(0,0,0,0.06)';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* \u2500\u2500 Payment Section Container \u2500\u2500 */}
        <div style={{
          padding: '12px 14px',
          background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.7)',
          border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
          borderRadius: 0,
        }}>

          {/* \u2500\u2500 Summary Data Bar (matches Identity data bar) \u2500\u2500 */}
          {paymentCount > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0,
              fontFamily: 'Raleway, sans-serif',
              padding: '10px 0',
              background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
              borderRadius: 0,
              border: `1px solid ${sep}`,
              marginBottom: 12,
            }}>
              {/* Total Paid */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Total Paid</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Raleway, sans-serif', color: totalPaid > 0 ? colours.highlight : (isDarkMode ? '#d1d5db' : '#374151'), textAlign: 'left' }}>
                  £{totalPaid.toLocaleString()}
                </span>
              </div>

              {/* Separator */}
              <div style={{ width: 1, background: sep, margin: '4px 0' }} />

              {/* Deal Amount */}
              {dealAmount > 0 && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Deal Amount</span>
                    <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'left' }}>
                      £{dealAmount.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ width: 1, background: sep, margin: '4px 0' }} />
                </>
              )}

              {/* Payments */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Payments</span>
                <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'left' }}>
                  {successCount}/{paymentCount} succeeded
                </span>
              </div>

              {/* Separator */}
              <div style={{ width: 1, background: sep, margin: '4px 0' }} />

              {/* Last Payment */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Last Payment</span>
                <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'left' }}>
                  {formattedLastDate}
                </span>
              </div>

              {/* Separator */}
              <div style={{ width: 1, background: sep, margin: '4px 0' }} />

              {/* Method */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Method</span>
                <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                  {hasCard && <FaCreditCard size={10} />}
                  {hasBank && <FaBuilding size={10} />}
                  {hasCard && hasBank ? 'Mixed' : hasCard ? 'Card' : hasBank ? 'Bank' : '\u2014'}
                </span>
              </div>
            </div>
          )}

          {/* \u2500\u2500 Result Indicator Pills (matches Identity pills) \u2500\u2500 */}
          {paymentCount > 0 && showPerPaymentStatusPills && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
              padding: '8px 0',
            }}>
              {/* Per-payment status pills */}
              {activePayments.map((p: any, idx: number) => {
                const st = p.payment_status || p.status || 'pending';
                const ok = st === 'succeeded' || st === 'confirmed';
                const fail = st === 'failed';
                const pColor = ok ? colours.highlight : fail ? colours.cta : (isDarkMode ? '#d1d5db' : '#374151');
                const amt = Number(p.amount || 0);
                return (
                  <div key={p.id || idx} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px',
                    background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                    border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                    borderRadius: 0,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      £{amt.toLocaleString()}
                    </span>
                    {ok ? <FaCheckCircle size={9} color={pColor} /> : fail ? <FaExclamationTriangle size={9} color={pColor} /> : <FaClock size={9} color={pColor} />}
                    <span style={{ fontSize: 10, fontWeight: 600, color: pColor }}>{st}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* \u2500\u2500 Controls Bar (matches Identity controls bar) \u2500\u2500 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 0',
            borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          }}>
            {/* Payment count badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px',
              background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
              borderRadius: 0,
              fontSize: 9,
              fontWeight: 600,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
            }}>
              <FaCreditCard size={8} />
              {paymentCount} record{paymentCount !== 1 ? 's' : ''}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Create payment link */}
            {isLocalEnv && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRequestPaymentLink?.(); }}
                title="Generate a Stripe payment link (copy & send to the client)"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px',
                  background: colours.highlight,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <FaLink size={9} />
                Create Payment Link
              </button>
            )}
          </div>

          {/* \u2500\u2500 Payment Records \u2500\u2500 */}
          {paymentCount === 0 ? (
            <div style={{ 
              textAlign: 'center',
              padding: '24px 0',
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
            }}>
              <FaCreditCard size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div style={{ fontSize: 11 }}>No payment records</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
              {activePayments.map((payment: any, idx: number) => {
                const paymentId = payment.id || payment.payment_id || `payment-${idx}`;
                const isExpanded = expandedPayment === paymentId;
                const status = payment.payment_status || payment.status || 'pending';
                const isSuccess = status === 'succeeded' || status === 'confirmed';
                const isFailed = status === 'failed';
                const statusColor = isSuccess ? colours.green : isFailed ? colours.cta : colours.orange;
                const paymentDate = payment.created_at || payment.date || payment.payment_date;
                const formattedDate = paymentDate 
                  ? new Date(paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                  : '\u2014';
                const formattedTime = paymentDate
                  ? new Date(paymentDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : '';
                
                // Determine payment method
                const methodRaw = (payment.payment_method || payment.payment_type || payment.method || payment.type || payment.paymentMethod || payment.PaymentMethod || payment.PaymentType || '').toString().toLowerCase();
                const meta = typeof payment.metadata === 'object' ? payment.metadata : {};
                const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
                const intentId = (payment.payment_intent_id || payment.paymentIntentId || '').toString();
                const intentIsBank = intentId.startsWith('bank_');
                const intentIsCard = intentId.startsWith('pi_');
                const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
                const isCard = combinedMethod.includes('card') || combinedMethod.includes('stripe') || combinedMethod === 'cc' || intentIsCard;
                const isBank = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || combinedMethod.includes('ach') || intentIsBank;
                const methodLabel = isCard ? 'Card' : isBank ? 'Bank' : combinedMethod ? combinedMethod.slice(0, 6) : '\u2014';
                const serviceLabel = deal?.ServiceDescription || deal?.serviceDescription || deal?.service_description || payment.product_description || payment.description || payment.product || 'Payment on Account';
                const paymentIdRaw = (payment.payment_id || payment.stripe_payment_id || payment.id || '\u2014').toString();
                const paymentRef = instructionRef || payment.instruction_ref || '\u2014';

                return (
                  <div key={paymentId} style={{
                    border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`,
                    borderRadius: 0,
                    marginBottom: idx < activePayments.length - 1 ? 6 : 0,
                    overflow: 'hidden',
                  }}>
                    {/* Collapsible Payment Row (matches Verification Data pattern) */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPayment(isExpanded ? null : paymentId);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontFamily: 'Raleway, sans-serif',
                        padding: '8px 10px',
                        background: isExpanded
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                          : (isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(244, 244, 246, 0.25)'),
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        {/* Status dot */}
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: statusColor,
                          flexShrink: 0,
                        }} />
                        {/* Amount */}
                        <span style={{
                          fontSize: 12, fontWeight: 600, fontFamily: 'Raleway, sans-serif',
                          color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)',
                          flexShrink: 0,
                        }}>
                          £{Number(payment.amount || 0).toLocaleString()}
                        </span>
                        {/* Method icon */}
                        <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                          {isCard ? <FaCreditCard size={10} /> : isBank ? <FaBuilding size={10} /> : null}
                          <span style={{ fontSize: 9, fontWeight: 600 }}>{methodLabel}</span>
                        </span>
                        {/* Collapsed preview: date + status */}
                        {!isExpanded && (
                          <span style={{
                            fontSize: 10,
                            color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.55)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {formattedDate}
                          </span>
                        )}
                      </div>
                      {/* Status pill + chevron */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minHeight: 20, fontSize: 9, padding: '0 8px', borderRadius: 0,
                          background: isSuccess
                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                            : isFailed
                              ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                              : (isDarkMode ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 140, 0, 0.08)'),
                          border: `1px solid ${statusColor}`,
                          color: statusColor,
                          fontWeight: 600, textTransform: 'lowercase',
                        }}>
                          {status}
                        </span>
                        <FaChevronDown
                          size={10}
                          style={{
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Expanded Detail (data bar pattern) */}
                    {isExpanded && (
                      <div style={{
                        fontFamily: 'Raleway, sans-serif',
                        borderTop: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`,
                      }}>
                        {/* Detail data bar */}
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0,
                          padding: '10px 0',
                          background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                          borderRadius: 0,
                        }}>
                          {/* Date */}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Date</span>
                            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'left' }}>
                              {formattedDate}{formattedTime ? ` ${formattedTime}` : ''}
                            </span>
                          </div>
                          <div style={{ width: 1, background: sep, margin: '4px 0' }} />

                          {/* Amount */}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Amount</span>
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Raleway, sans-serif', color: colours.highlight, textAlign: 'left' }}>
                              £{Number(payment.amount || 0).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ width: 1, background: sep, margin: '4px 0' }} />

                          {/* Currency */}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Currency</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#d1d5db' : '#374151', textTransform: 'uppercase', textAlign: 'left' }}>
                              {(payment.currency || 'GBP').toString().toUpperCase()}
                            </span>
                          </div>
                          <div style={{ width: 1, background: sep, margin: '4px 0' }} />

                          {/* Method */}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Method</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                              {isCard ? <FaCreditCard size={10} /> : isBank ? <FaBuilding size={10} /> : null}
                              {methodLabel}
                            </span>
                          </div>
                        </div>

                        {/* Service description */}
                        <div style={{
                          padding: '10px 14px',
                          borderTop: `1px solid ${sep}`,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Service</span>
                            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733', textAlign: 'left' }}>
                              {serviceLabel}
                            </span>
                          </div>
                        </div>

                        {/* IDs & Ref */}
                        <div style={{
                          padding: '10px 14px',
                          borderTop: `1px solid ${sep}`,
                          display: 'flex', flexWrap: 'wrap', gap: 12,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Payment ID</span>
                            <span
                              style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'left' }}
                              onClick={(e) => { e.stopPropagation(); void safeCopy(paymentIdRaw); showToast({ type: 'success', message: 'Payment ID copied' }); }}
                              title="Click to copy"
                            >
                              {paymentIdRaw}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Instruction Ref</span>
                            <span
                              style={{ fontSize: 11, fontWeight: 500, fontFamily: 'Raleway, sans-serif', color: isDarkMode ? '#d1d5db' : '#374151', cursor: 'pointer', textAlign: 'left' }}
                              onClick={(e) => { e.stopPropagation(); void safeCopy(paymentRef); showToast({ type: 'success', message: 'Ref copied' }); }}
                              title="Click to copy"
                            >
                              {paymentRef}
                            </span>
                          </div>
                        </div>

                        {/* Actions bar */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px',
                          borderTop: `1px solid ${sep}`,
                        }}>
                          {payment.receipt_url && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); window.open(payment.receipt_url, '_blank'); }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '5px 10px',
                                background: 'transparent',
                                color: isDarkMode ? '#d1d5db' : '#374151',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                                borderRadius: 0,
                                fontSize: 10, fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <FaReceipt size={9} />
                              View Receipt
                              <FaChevronRight size={8} style={{ opacity: 0.5 }} />
                            </button>
                          )}
                          <div style={{ flex: 1 }} />
                          {/* Bank Payment Confirmation */}
                          {isBank && !isSuccess && onConfirmBankPayment && (
                            <BankPaymentConfirmation
                              paymentId={paymentId}
                              isDarkMode={isDarkMode}
                              onConfirm={onConfirmBankPayment}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="inline-workbench"
      data-action-button="true"
      onClick={handleWorkbenchClick}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        overflow: 'visible',
        marginBottom: 0,
        fontFamily: 'Raleway, sans-serif',
        position: 'relative',
        zIndex: 5,
        pointerEvents: 'auto',
        boxShadow: 'none',
      }}
    >
      {/* Pipeline Tabs - Instructed → Pay → ID → Risk → Matter → Docs */}
      {pipelineStages.length > 0 && (
      <div 
        data-action-button="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '10px 16px 12px',
          borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.grey}`,
          background: isDarkMode ? colours.dark.sectionBackground : 'rgba(255, 255, 255, 0.8)',
          position: 'relative',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {pipelineStages.map((stage, idx) => {
            const prevStage = idx > 0 ? pipelineStages[idx - 1] : null;
            // Enquiry and Pitch are context stages (data views)
            const isContextStage = ['enquiry', 'pitch', 'instructed'].includes(stage.key);
            const isTabStage = ['identity', 'payment', 'risk', 'matter', 'documents'].includes(stage.key);
            
            // Skip tab stages if disabled (they're shown in the parent pipeline)
            if (isTabStage && !enableTabStages) return null;
            
            // Determine active state
            const isTabActive = isTabStage && activeTab === stage.navigatesTo;
            const isContextActive = isContextStage && (
               // Instructed is active if we are on 'details' and NO specific context stage is set
               (stage.key === 'instructed' && activeTab === 'details' && !activeContextStage) ||
               // Enquiry/Pitch are active if they match the context stage
               (activeContextStage === stage.key)
            );

            const isActive = isTabActive || isContextActive;
            
            // Status colors
            const statusColors = getStagePalette(stage); // Fallback colors for icon/text
            
            // Connector Logic - connector lights up when the PREVIOUS stage is complete
            // This shows the progression/link between stages has been achieved
            const connectorColor = prevStage?.isComplete 
              ? colours.highlight  // Blue when previous stage is complete
              : (isDarkMode ? colours.dark.border : '#d1d5db'); // Gray otherwise

            // Click Handler
            const handleClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              
              if (isContextStage) {
                 setActiveTab('details');
                 // Toggle logic or set context
                 if (stage.key === 'enquiry' || stage.key === 'pitch') {
                   // If already active, maybe toggle off? User usually expects "click to view". 
                   // Let's keep it simple: Click sets it.
                   setActiveContextStage(stage.key as ContextStageKey);
                 } else {
                   // Instructed -> Clear context stage (shows default details)
                   setActiveContextStage(null);
                 }
              } else {
                // Tab Stage
                setActiveContextStage(null);
                if (isActive) {
                   // Toggle off to details if already active? 
                   setActiveTab('details');
                } else {
                   setActiveTab(stage.navigatesTo as WorkbenchTab);
                }
              }
            };

            // Is the connector "lit" (previous stage complete)?
            const isConnectorLit = prevStage?.isComplete;

            const chipBaseBackground = isActive
              ? 'rgba(54, 144, 206, 0.12)'
              : (isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)');
            const chipBaseBorder = isActive
              ? '1px solid rgba(54, 144, 206, 0.45)'
              : `1px solid ${isDarkMode ? colours.dark.border : `${colours.subtleGrey}33`}`;
            const chipBaseOpacity = stage.status === 'pending' || stage.status === 'neutral' ? 0.7 : 1;
            const chipHoverBackground = isActive
              ? 'rgba(54, 144, 206, 0.16)'
              : (isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.06)');
            const chipHoverBorder = isActive
              ? '1px solid rgba(54, 144, 206, 0.55)'
              : '1px solid rgba(54, 144, 206, 0.35)';

            return (
              <React.Fragment key={stage.key}>
                {/* Connector line - lights up green when previous stage is complete */}
                {idx > 0 && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      height: 2,
                      width: 12,
                      background: isConnectorLit 
                        ? colours.green
                        : (isDarkMode ? colours.dark.border : `${colours.greyText}66`),
                      borderRadius: 1,
                      margin: '0 2px',
                    }} />
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={handleClick}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = chipHoverBackground;
                    e.currentTarget.style.border = chipHoverBorder;
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = chipBaseBackground;
                    e.currentTarget.style.border = chipBaseBorder;
                    e.currentTarget.style.opacity = String(chipBaseOpacity);
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    minHeight: 28,
                    height: 28,
                    borderRadius: 0,
                    background: chipBaseBackground,
                    border: chipBaseBorder,
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: 'none',
                    color: statusColors.text,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 600,
                    lineHeight: 1,
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap' as const,
                    position: 'relative',
                    zIndex: 1,
                    opacity: chipBaseOpacity,
                  }}
                  title={stage.date ? `${stage.label}: ${stage.date}` : `${stage.label}${stage.status === 'pending' || stage.status === 'neutral' ? ' — no records yet' : ''}`}
                >
                  <span style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 12,
                    minWidth: 12,
                    color: statusColors.text, 
                    opacity: isActive ? 1 : 0.9,
                  }}>
                    {stage.icon}
                  </span>
                  
                  <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
                    {stage.label}
                  </span>

                  {/* Status Badges / Checks */}
                  {(stage as any).count !== undefined && (stage as any).count > 0 ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      background: isDarkMode ? `${colours.subtleGrey}2e` : `${colours.subtleGrey}2e`,
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.7)',
                      marginLeft: 2,
                      flexShrink: 0,
                    }}>
                      {(stage as any).count}
                    </span>
                  ) : stage.isComplete ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 12,
                      minWidth: 12,
                      height: 12,
                      marginLeft: 2,
                      flexShrink: 0,
                    }}>
                      <FaCheck size={9} style={{ color: colours.highlight }} />
                    </span>
                  ) : stage.hasIssue ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 12,
                      minWidth: 12,
                      height: 12,
                      marginLeft: 2,
                      flexShrink: 0,
                    }}>
                      <FaExclamationTriangle size={9} style={{ color: '#D65541' }} />
                    </span>
                  ) : null}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      )}

      {/* Tab content - expand as needed */}
      <div style={{
        padding: '6px 8px 8px 8px',
        minHeight: 96,
        border: 'none',
        borderTop: 'none',
        borderRadius: 0,
        marginTop: 0,
        marginBottom: 0,
        boxShadow: 'none',
        transform: 'none',
        transition: 'none',
      }}>
        {/* Details Tab - Client/Entity information landing page */}
        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              // Respect activeContextStage even if chips are hidden
              const contextStage: ContextStageKey = activeContextStage ?? 'enquiry';

              return (
                <>
                  {/* Client Type Banner - Prominent cue for company vs individual */}
                  {isCompany && contextStage !== 'instructed' && (
                    <div style={{
                      padding: flatEmbedMode ? '4px 0 8px' : '8px 14px',
                      background: flatEmbedMode ? 'transparent' : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'),
                      border: flatEmbedMode ? 'none' : `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                      borderRadius: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <FaBuilding size={12} color={colours.highlight} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: colours.highlight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Company Client
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.8)', marginLeft: 4 }}>
                        {companyName !== '—' ? companyName : ''}
                        {companyNo !== '—' && <span style={{ fontFamily: 'monospace', marginLeft: 6, opacity: 0.7 }}>({companyNo})</span>}
                      </span>
                    </div>
                  )}

                  {/* Client/Entity Header Card */}
                  <div style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 0,
                    padding: '0',
                  }}>


                    {/* Meta tags (match enquiry table/overview look & feel) */}
                    <div>
                      {(() => {
                        const tagBase: React.CSSProperties = {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(6, 23, 51, 0.06)'}`,
                          background: isDarkMode ? 'rgba(160, 160, 160, 0.04)' : 'rgba(6, 23, 51, 0.02)',
                          color: isDarkMode ? 'rgba(243, 244, 246, 0.78)' : 'rgba(6, 23, 51, 0.72)',
                          fontSize: 10,
                          fontWeight: 500,
                          lineHeight: 1,
                          maxWidth: '100%',
                        };

                        const tagText: React.CSSProperties = {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 360,
                        };

                        const isMeaningful = (v: any) => {
                          if (v === null || v === undefined) return false;
                          const s = String(v).trim();
                          return s.length > 0 && s !== '—';
                        };

                        const resolveAowAccent = (raw: any): string => {
                          const a = String(raw ?? '').toLowerCase();
                          if (a.includes('commercial')) return colours.blue;
                          if (a.includes('construction')) return colours.orange;
                          if (a.includes('property')) return colours.green;
                          if (a.includes('employment')) return colours.yellow;
                          return colours.greyText;
                        };

                        const getAreaOfWorkIcon = (raw: any): string => getAreaOfWorkEmoji(String(raw ?? ''));

                        const renderTag = (opts: {
                          iconName: string;
                          label: string;
                          value: any;
                          monospace?: boolean;
                          accentLeft?: string;
                          onClick?: () => void;
                        }) => {
                          if (!isMeaningful(opts.value)) return null;
                          const valueText = String(opts.value);
                          const clickable = Boolean(opts.onClick);
                          return (
                            <div
                              title={`${opts.label}: ${valueText}`}
                              onClick={(e) => {
                                if (!opts.onClick) return;
                                e.stopPropagation();
                                opts.onClick();
                              }}
                              style={{
                                ...tagBase,
                                cursor: clickable ? 'pointer' : 'default',
                                borderLeft: opts.accentLeft ? `3px solid ${opts.accentLeft}` : tagBase.borderLeft,
                              }}
                            >
                              <Icon iconName={opts.iconName} styles={{ root: { fontSize: 11, opacity: 0.6 } }} />
                              <span style={{ ...tagText, fontFamily: opts.monospace ? 'monospace' : undefined }}>
                                {valueText}
                              </span>
                            </div>
                          );
                        };

                        if (contextStage === 'enquiry') {
                          const aowAccent = resolveAowAccent(areaOfWork);
                          
                          // Determine rating styling
                          const ratingColor = enquiryRating === 'Good' ? colours.highlight : enquiryRating === 'Poor' ? colours.cta : (isDarkMode ? colours.subtleGrey : colours.greyText);
                          
                          // Claim timestamp for new space enquiries (from enquiry record, enrichment, or instruction data)
                          // Use empty-string fallback so we can fall through to enrichment data
                          const claimFromEnquiry = getValue(['claim', 'Claim', 'ClaimTimestamp', 'claim_timestamp', 'AllocatedAt', 'allocated_at', 'ClaimedAt', 'claimed_at'], '');
                          const claimTimestampRaw = (claimFromEnquiry && claimFromEnquiry !== '—')
                            ? claimFromEnquiry
                            : enrichmentTeamsData?.ClaimedAt || null;

                          const parseDateSafe = (value: any): Date | null => {
                            if (value === null || value === undefined || value === '') return null;
                            if (value instanceof Date) {
                              return Number.isNaN(value.getTime()) ? null : value;
                            }
                            if (typeof value === 'number') {
                              const ts = value < 1e12 ? value * 1000 : value;
                              const d = new Date(ts);
                              return Number.isNaN(d.getTime()) ? null : d;
                            }
                            if (typeof value === 'string') {
                              const raw = value.trim();
                              if (!raw) return null;
                              if (/^\d{10,13}$/.test(raw)) {
                                const n = Number(raw);
                                if (!Number.isNaN(n)) {
                                  const ts = raw.length === 10 ? n * 1000 : n;
                                  const d = new Date(ts);
                                  if (!Number.isNaN(d.getTime())) return d;
                                }
                              }
                              const d = new Date(raw);
                              return Number.isNaN(d.getTime()) ? null : d;
                            }
                            return null;
                          };

                          const hasExplicitTime = (value: any): boolean => {
                            if (!value) return false;
                            if (typeof value === 'string') {
                              const raw = value.trim();
                              if (!raw) return false;
                              if (/^\d{10,13}$/.test(raw)) return true;
                              return /T\d{2}:\d{2}/.test(raw) || /(?:^|\D)\d{1,2}[:.]\d{2}(?::\d{2})?(?:\D|$)/.test(raw);
                            }
                            return value instanceof Date || typeof value === 'number';
                          };

                          const parseClockTime = (value: any): string | null => {
                            if (!value) return null;
                            if (typeof value === 'string') {
                              const raw = value.trim();
                              if (!raw) return null;
                              const m = raw.match(/(\d{1,2})[:.](\d{2})/);
                              if (m) {
                                const hh = Math.max(0, Math.min(23, Number(m[1])));
                                const mm = Math.max(0, Math.min(59, Number(m[2])));
                                return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                              }
                            }
                            try {
                              const d = parseDateSafe(value);
                              if (!d) return null;
                              return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                            } catch {
                              return null;
                            }
                          };

                          const mergeDateAndClock = (dateValue: any, clockValue: any): Date | null => {
                            const hhmm = parseClockTime(clockValue);
                            if (!dateValue || !hhmm) return null;
                            try {
                              const base = parseDateSafe(dateValue);
                              if (!base) return null;
                              const [hh, mm] = hhmm.split(':').map((v) => Number(v));
                              const merged = new Date(base);
                              merged.setHours(hh, mm, 0, 0);
                              return merged;
                            } catch {
                              return null;
                            }
                          };
                          
                          // Teams timestamp from enrichment data — prefer ClaimedAt (actual claim time),
                          // then MessageTimestamp (original bot card), then CreatedAt (tracking record)
                          const teamsTimestampRaw = enrichmentTeamsData?.ClaimedAt
                            || enrichmentTeamsData?.MessageTimestamp 
                            || enrichmentTeamsData?.CreatedAt 
                            || (enrichmentTeamsData?.CreatedAtMs ? new Date(enrichmentTeamsData.CreatedAtMs).toISOString() : null);

                          const claimedFallbackRaw = getValue([
                            'ClaimedDateTime',
                            'claimedDateTime',
                            'ClaimedDate',
                            'claimedDate',
                            'Date_Claimed',
                            'date_claimed',
                            'DateClaimed',
                            'dateClaimed',
                            'Claimed_On',
                            'claimed_on',
                            'ClaimedOn',
                            'claimedOn',
                          ], '');

                          const claimTimeRaw =
                            getValue(['ClaimedTime', 'claimedTime', 'Claim_Time', 'claim_time', 'AllocatedTime', 'allocatedTime', 'allocated_time', 'ClaimTime'], '') ||
                            (enquiry as any)?.ClaimedTime || (enquiry as any)?.claimedTime || (enquiry as any)?.Claim_Time || (enquiry as any)?.claim_time ||
                            (inst as any)?.ClaimedTime || (inst as any)?.claimedTime || (inst as any)?.Claim_Time || (inst as any)?.claim_time ||
                            null;
                          
                          const claimedByInitials = (() => {
                            const raw = String(pointOfContact || '').trim();
                            if (!raw || raw === '—') return '—';
                            if (/^[A-Za-z]{1,4}$/.test(raw)) return raw.toUpperCase();
                            const parts = raw.split(/\s+/).filter(Boolean);
                            if (parts.length >= 2) {
                              return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
                            }
                            return raw.slice(0, 2).toUpperCase();
                          })();

                          // Prefer Teams timestamp from enrichment, fall back to claim timestamp
                          const claimedDateTime = (() => {
                            const claimDateBase = teamsTimestampRaw || claimTimestampRaw || claimedFallbackRaw || submissionDateRaw || null;
                            const mergedClaimDateTime = mergeDateAndClock(claimDateBase, claimTimeRaw);
                            const candidates: Array<{ value: string | number | Date; allowTime: boolean }> = [
                              { value: mergedClaimDateTime, allowTime: true },
                              { value: teamsTimestampRaw, allowTime: true },
                              { value: claimTimestampRaw, allowTime: true },
                              { value: claimedFallbackRaw || null, allowTime: true },
                              { value: submissionDateRaw, allowTime: false },
                            ].filter((item) => Boolean(item.value)) as Array<{ value: string | number | Date; allowTime: boolean }>;

                            let dateOnlyFallback: string | null = null;

                            for (const candidate of candidates) {
                              try {
                                const d = parseDateSafe(candidate.value);
                                if (d) {
                                  const date = formatRelativeDay(d);
                                  const hasIntrinsicTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
                                  const canShowTime = candidate.allowTime && (hasExplicitTime(candidate.value) || hasIntrinsicTime);
                                  if (canShowTime) {
                                    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                    return `${date} ${time}`;
                                  }
                                  if (!dateOnlyFallback) dateOnlyFallback = date;
                                }
                              } catch {
                                // continue to next candidate
                              }
                            }

                            return dateOnlyFallback;
                          })();

                          // Duration between touchpoint and claim
                          const claimDuration = (() => {
                            const claimRaw = teamsTimestampRaw || claimTimestampRaw;
                            if (!submissionDateRaw || submissionDateRaw === '—' || !claimRaw) return null;
                            if (!hasExplicitTime(submissionDateRaw)) return null;
                            try {
                              const start = new Date(submissionDateRaw);
                              const end = new Date(claimRaw);
                              if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
                              const diffMs = end.getTime() - start.getTime();
                              if (diffMs < 0) return null;
                              const mins = Math.floor(diffMs / 60000);
                              if (mins < 1) return '<1m';
                              if (mins < 60) return `${mins}m`;
                              const hrs = Math.floor(mins / 60);
                              const remMins = mins % 60;
                              if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                              const days = Math.floor(hrs / 24);
                              const remHrs = hrs % 24;
                              return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
                            } catch { return null; }
                          })();
                          
                          // Teams link from enrichment data or resolved via API
                          const effectiveTeamsLink = enrichmentTeamsData?.teamsLink || teamsCardLink || null;
                          
                          // Teams chip shows if we have enrichment data, teamsCardLink, teamsIdentifier (can fetch), or claim time
                          const hasTeamsData = Boolean(enrichmentTeamsData || teamsCardLink || teamsIdentifier || claimedDateTime || isDemoInstruction);

                          // Flattened layout tokens (no nested panel container)
                          const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
                          const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
                          const textBody = isDarkMode ? '#d1d5db' : '#374151';
                          const dividerColour = isDarkMode ? colours.dark.border : colours.grey;
                          const enquiryId = enquiry?.ID || enquiry?.id || '';

                          // ── Ledger tokens ──
                          const borderLine = isDarkMode ? `1px solid ${colours.dark.border}50` : `1px solid ${colours.highlightNeutral}`;
                          const hoverBg = isDarkMode ? 'rgba(13, 47, 96, 0.25)' : 'rgba(214, 232, 255, 0.25)';
                          const insetBg = isDarkMode ? 'rgba(0, 3, 25, 0.25)' : 'rgba(255, 255, 255, 0.4)';
                          const separatorColor = isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral;

                          // Dispatch edit event
                          const dispatchEdit = (field: string) => {
                            window.dispatchEvent(new CustomEvent('helix:edit-enquiry-field', {
                              detail: { enquiryId: String(enquiryId), field, currentValue: getValue([field]) }
                            }));
                          };

                          // Data bar column with hover-to-edit
                          const DataCol = ({ label, value, accent, mono, icon: colIcon, onEdit, maxW }: {
                            label: string;
                            value: string;
                            accent?: string;
                            mono?: boolean;
                            icon?: React.ReactNode;
                            onEdit?: () => void;
                            maxW?: number;
                          }) => (
                            <div
                              style={{
                                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px',
                                position: 'relative', cursor: onEdit ? 'default' : undefined,
                              }}
                              onMouseEnter={(e) => {
                                const ed = e.currentTarget.querySelector('[data-edit]') as HTMLElement;
                                if (ed) ed.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                const ed = e.currentTarget.querySelector('[data-edit]') as HTMLElement;
                                if (ed) ed.style.opacity = '0';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted }}>{label}</span>
                                {onEdit && (
                                  <span
                                    data-edit=""
                                    style={{ opacity: 0, cursor: 'pointer', transition: 'opacity 0.12s ease', lineHeight: 1 }}
                                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    title={`Edit ${label.toLowerCase()}`}
                                  >
                                    <Icon iconName="Edit" styles={{ root: { fontSize: 8, color: textMuted } }} />
                                  </span>
                                )}
                              </div>
                              <span style={{
                                fontSize: 12, fontWeight: value && value !== '—' ? 500 : 400,
                                color: accent || (value && value !== '—' ? textBody : textMuted),
                                fontFamily: mono ? 'Raleway, sans-serif' : 'Raleway, sans-serif',
                                display: 'flex', alignItems: 'center', gap: 4,
                                textAlign: 'left',
                                maxWidth: maxW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {colIcon}{value}
                              </span>
                            </div>
                          );

                          // Vertical separator
                          const Sep = () => (
                            <div style={{ width: 1, alignSelf: 'stretch', background: separatorColor, margin: '4px 0' }} />
                          );

                          // Inline action chip (contact / integration)
                          const actionChipStyle: React.CSSProperties = {
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 9px', borderRadius: 0,
                            border: borderLine, background: 'transparent',
                            fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
                            cursor: 'pointer', transition: 'background 0.12s ease',
                            whiteSpace: 'nowrap',
                          };

                          // Submission time (HH:MM) for v2/instruction space enquiries
                          const submissionTime = (() => {
                            const shouldHideTouchpointTime = (time: string | null): boolean => time === '00:00';
                            const asTime = (value: any, requireExplicitTime: boolean = false): string | null => {
                              if (!value) return null;
                              if (requireExplicitTime && !hasExplicitTime(value)) return null;
                              try {
                                const d = new Date(value);
                                if (Number.isNaN(d.getTime())) return null;
                                return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                              } catch {
                                return null;
                              }
                            };

                            // Primary: touchpoint datetime itself, but only if it actually contains time.
                            if (submissionDateRaw && submissionDateRaw !== '—') {
                              const iso = typeof submissionDateRaw === 'string' ? submissionDateRaw : '';
                              const hasTime = /T\d{2}:/.test(iso) || /\d{2}:\d{2}/.test(iso);
                              if (hasTime) {
                                const direct = asTime(submissionDateRaw, true);
                                if (direct && !shouldHideTouchpointTime(direct)) return direct;
                              }
                            }

                            // Secondary: explicit time fields from enquiry/instruction payloads.
                            const explicitTime =
                              getValue(['Touchpoint_Time', 'touchpoint_time', 'SubmissionTime', 'submission_time', 'Time', 'time'], '') ||
                              inst?.SubmissionTime || inst?.submissionTime || inst?.CreatedTime || inst?.createdTime ||
                              (enquiry as any)?.Touchpoint_Time || (enquiry as any)?.touchpoint_time || null;
                            const explicitParsed = asTime(explicitTime, true);
                            if (explicitParsed && !shouldHideTouchpointTime(explicitParsed)) return explicitParsed;

                            // Demo fallback: use claim timestamp time so touchpoint visuals stay representative.
                            if (isDemoInstruction) {
                              const demoFallback = asTime(teamsTimestampRaw || claimTimestampRaw || claimedFallbackRaw || null);
                              if (demoFallback) return demoFallback;
                            }

                            return null;
                          })();

                          const enquiryHeaderDescription = 'Review details below.';

                          return (
                            <div style={{
                              fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                gap: 8,
                                padding: flatEmbedMode ? '6px 0' : '8px 14px',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ color: headerCueAccent, display: 'flex', alignItems: 'center' }}>
                                    <FaEnvelope size={12} />
                                  </span>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    color: headerCueAccent,
                                  }}>
                                    Enquiry claimed
                                  </span>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.78)',
                                    marginLeft: 4,
                                  }}>
                                    {enquiryHeaderDescription}
                                  </span>
                                </div>
                              </div>

                              {(submissionDate && submissionDate !== '—') || hasTeamsData ? (
                                <div style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                  padding: flatEmbedMode ? '0 0 2px' : '0 14px 2px', minHeight: 36,
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                    {submissionDate && submissionDate !== '—' && (
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '5px 10px', borderRadius: 0,
                                        background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)',
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                                        flexShrink: 0,
                                      }}>
                                        <FaClock size={10} style={{ color: textMuted }} />
                                        <span style={{ fontSize: 10, fontWeight: 600, color: textBody }}>
                                          Touchpoint · {formatRelativeDateOnly(submissionDateRaw)}{submissionTime && <span style={{ color: textMuted, fontWeight: 500 }}> · {submissionTime}</span>}
                                        </span>
                                      </div>
                                    )}

                                    {hasTeamsData && (
                                      <div style={{
                                        display: 'flex', alignItems: 'center', width: 60,
                                        margin: '0 2px',
                                      }}>
                                        <div style={{
                                          flex: 1, height: 1,
                                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                        }} />
                                        {claimDuration && (
                                          <span style={{
                                            fontSize: 9,
                                            fontWeight: isDarkMode ? 700 : 600,
                                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                            opacity: isDarkMode ? 1 : 0.72,
                                            padding: '1px 5px',
                                            whiteSpace: 'nowrap',
                                          }}>
                                            {claimDuration}
                                          </span>
                                        )}
                                        <div style={{
                                          flex: 1, height: 1,
                                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                        }} />
                                      </div>
                                    )}

                                    {hasTeamsData && (
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (effectiveTeamsLink) window.open(effectiveTeamsLink, '_blank');
                                          else if (teamsIdentifier && !teamsCardLink) void resolveTeamsCardLink();
                                        }}
                                        title={effectiveTeamsLink ? 'Open Teams Card' : 'Teams activity tracked'}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 6,
                                          padding: '5px 10px', borderRadius: 0,
                                          background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
                                          border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)'}`,
                                          cursor: effectiveTeamsLink ? 'pointer' : 'default',
                                          transition: 'all 0.15s ease',
                                          flexShrink: 0,
                                        }}
                                      >
                                        <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 12, color: colours.green } }} />
                                        {claimedDateTime ? (
                                          <span style={{ fontSize: 10, fontWeight: 600, color: colours.green }}>
                                            Claimed by {claimedByInitials}
                                            <span style={{ color: isDarkMode ? 'rgba(32, 178, 108, 0.8)' : 'rgba(32, 178, 108, 0.9)', fontWeight: 500 }}> · {claimedDateTime}</span>
                                          </span>
                                        ) : (
                                          <span style={{ fontSize: 10, fontWeight: 600, color: colours.green }}>Teams</span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    onClick={() => {
                                      if (!enquiryRating || enquiryRating === '—') {
                                        const eid = enquiry?.ID || enquiry?.id;
                                        if (eid) window.dispatchEvent(new CustomEvent('helix:rate-enquiry', { detail: { enquiryId: String(eid) } }));
                                      }
                                    }}
                                    title={!enquiryRating || enquiryRating === '—' ? 'Click to rate this enquiry' : `Rated: ${enquiryRating}`}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                                      cursor: (!enquiryRating || enquiryRating === '—') ? 'pointer' : 'default',
                                      transition: 'all 0.15s ease',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {enquiryRating === 'Good' ? <Icon iconName="Like" styles={{ root: { fontSize: 11, color: ratingColor } }} />
                                    : enquiryRating === 'Poor' ? <Icon iconName="Dislike" styles={{ root: { fontSize: 11, color: ratingColor } }} />
                                    : <FaStar size={11} color={ratingColor} />}
                                    <span style={{ fontSize: 10, fontWeight: 600, color: ratingColor }}>{enquiryRating || 'Rate'}</span>
                                  </div>
                                </div>
                              ) : null}

                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                                borderRadius: 0,
                                padding: '12px 14px',
                              }}>

                              {/* ── Data bar: horizontal columns with vertical separators ── */}
                              <div style={{
                                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0,
                                padding: '14px 0',
                                border: `1px solid ${separatorColor}`,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.4)',
                              }}>
                                <DataCol
                                  label="Area" value={areaOfWork ? areaOfWork.charAt(0).toUpperCase() + areaOfWork.slice(1) : '—'}
                                  icon={
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        background: areaOfWork && areaOfWork !== '—' ? aowAccent : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                        boxShadow: areaOfWork && areaOfWork !== '—' ? `0 0 0 1px ${isDarkMode ? 'rgba(0, 3, 25, 0.5)' : 'rgba(255, 255, 255, 0.85)'}` : 'none',
                                        flexShrink: 0,
                                      }}
                                    />
                                  }
                                  onEdit={() => dispatchEdit('Area_of_Work')}
                                />
                                {isMeaningful(typeOfWork) && (
                                  <><Sep /><DataCol label="Type" value={String(typeOfWork)} onEdit={() => dispatchEdit('Type_of_Work')} /></>
                                )}
                                <Sep />
                                <DataCol
                                  label="Claimed By"
                                  value={(() => {
                                    if (!pointOfContact) return 'Unclaimed';
                                    if (teamData) {
                                      const n = pointOfContact.toLowerCase().trim();
                                      const match = teamData.find(t => {
                                        const em = (t.Email || '').toLowerCase().trim();
                                        const init = (t.Initials || '').toLowerCase().trim();
                                        const nick = (t.Nickname || '').toLowerCase().trim();
                                        return em === n || init === n || nick === n;
                                      });
                                      if (match) return match['Full Name'] || match.First || pointOfContact;
                                    }
                                    return pointOfContact;
                                  })()}
                                />
                                <Sep />
                                <DataCol
                                  label="Value"
                                  value={isMeaningful(enquiryValue) ? String(enquiryValue) : '—'}
                                  onEdit={() => dispatchEdit('Value')}
                                />
                                <Sep />
                                <DataCol
                                  label="Channel"
                                  value={isMeaningful(methodOfContact) ? String(methodOfContact) : '—'}
                                  onEdit={() => dispatchEdit('Method_of_Contact')}
                                />
                                <Sep />
                                <DataCol
                                  label="Source"
                                  value={isMeaningful(enquirySourceSummary) ? String(enquirySourceSummary) : '—'}
                                  onEdit={() => dispatchEdit('Source')}
                                  maxW={120}
                                />
                              </div>

                              {/* ── Notes (full-width footer) ── */}
                              {hasEnquiryNotes && (
                                <div>
                                  <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '4px 0 3px',
                                  }}>
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                      textTransform: 'uppercase',
                                      color: isDarkMode ? colours.accent : colours.highlight,
                                      display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                      <Icon iconName="EditNote" styles={{ root: { fontSize: 10, color: isDarkMode ? colours.accent : colours.highlight } }} />
                                      Enquiry Notes
                                    </span>
                                    <span
                                      style={{ cursor: 'pointer', padding: '2px 4px' }}
                                      onClick={() => dispatchEdit('Notes')}
                                      title="Edit notes"
                                    >
                                      <Icon iconName="Edit" styles={{ root: { fontSize: 10, color: textMuted } }} />
                                    </span>
                                  </div>
                                  <div style={{
                                    fontSize: 12, lineHeight: 1.6, color: textBody,
                                    whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
                                    padding: '8px 14px',
                                    margin: '4px 0 10px',
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                                    border: `1px solid ${separatorColor}`,
                                  }}>
                                    {enquiryNotes}
                                  </div>
                                </div>
                              )}
                              </div>
                            </div>
                          );
                        }

                        // Pitch context - show deal/pitch data in rich enquiry-style layout
                        if (contextStage === 'pitch') {
                          const dealId = deal?.DealId || deal?.dealId || effectivePitch?.DealId || effectivePitch?.dealId || '';
                          const dealPasscode = deal?.Passcode || deal?.passcode || effectivePitch?.Passcode || effectivePitch?.passcode || '';
                          const dealAmount = deal?.Amount || deal?.amount || deal?.FeeAmount || deal?.feeAmount || effectivePitch?.Amount || effectivePitch?.amount;
                          const dealScenario = effectivePitch?.scenarioLabel || effectivePitch?.scenario || effectivePitch?.ServiceDescription || deal?.ServiceDescription || deal?.serviceDescription || '';
                          const pitchInstructionRef = deal?.InstructionRef || deal?.instructionRef || effectivePitch?.InstructionRef || effectivePitch?.instructionRef || '';
                          const resolvedPitchPasscode = (() => {
                            if (dealPasscode) return String(dealPasscode);
                            const ref = String(pitchInstructionRef || '').trim();
                            const match = ref.match(/^HLX-\d+-(\d+)$/i);
                            return match?.[1] || '';
                          })();
                          const pitchedBy = effectivePitch?.CreatedBy || effectivePitch?.createdBy || deal?.PitchedBy || deal?.pitchedBy || pointOfContact || '';
                          const pitchStatus = deal?.Status || deal?.status || effectivePitch?.Status || effectivePitch?.status || '';
                          const pitchExpiryRawFromSource =
                            deal?.PitchValidUntil ||
                            deal?.pitchValidUntil ||
                            deal?.ExpiryDate ||
                            deal?.expiryDate ||
                            deal?.ExpiresAt ||
                            deal?.expiresAt ||
                            deal?.ValidUntil ||
                            deal?.validUntil ||
                            effectivePitch?.PitchValidUntil ||
                            effectivePitch?.pitchValidUntil ||
                            effectivePitch?.ExpiryDate ||
                            effectivePitch?.expiryDate ||
                            effectivePitch?.ExpiresAt ||
                            effectivePitch?.expiresAt ||
                            effectivePitch?.ValidUntil ||
                            effectivePitch?.validUntil ||
                            null;
                          const pitchEmailSubject = effectivePitch?.EmailSubject || effectivePitch?.emailSubject || '';
                          const pitchEmailBody = effectivePitch?.EmailBody || effectivePitch?.emailBody || '';
                          // Don't fall back to enquiry notes - pitch content should be pitch-specific
                          const pitchNotes = effectivePitch?.Notes || effectivePitch?.notes || '';
                          const hasPitchContent = pitchEmailSubject || pitchEmailBody;
                          
                          // Strip HTML tags from pitch email body for preview
                          const stripHtml = (html: string) => {
                            return html
                              .replace(/<div><br><\/div>/gi, '\n')
                              .replace(/<br\s*\/?>/gi, '\n')
                              .replace(/<\/div>/gi, '\n')
                              .replace(/<div>/gi, '')
                              .replace(/<[^>]+>/g, '')
                              .replace(/&nbsp;/g, ' ')
                              .replace(/\n{3,}/g, '\n\n')
                              .trim();
                          };
                          const cleanEmailBody = pitchEmailBody ? stripHtml(pitchEmailBody) : '';

                          const extractClockParts = (value: any): { hours: number; minutes: number } | null => {
                            if (!value) return null;
                            if (typeof value === 'string') {
                              const raw = value.trim();
                              if (!raw) return null;
                              const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
                              if (isoMatch) {
                                return { hours: Number(isoMatch[1]), minutes: Number(isoMatch[2]) };
                              }
                              const plainMatch = raw.match(/(\d{1,2})[:.](\d{2})/);
                              if (plainMatch) {
                                return {
                                  hours: Math.max(0, Math.min(23, Number(plainMatch[1]))),
                                  minutes: Math.max(0, Math.min(59, Number(plainMatch[2]))),
                                };
                              }
                            }
                            try {
                              const d = new Date(value);
                              if (Number.isNaN(d.getTime())) return null;
                              return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
                            } catch {
                              return null;
                            }
                          };

                          const formatUkTime = (date: Date): string => date.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/London',
                          });
                          
                          // Check if we have any pitch data at all
                          const hasNoPitchData = !deal && !effectivePitch && !isFetchingPitchContent;
                          
                          // Combine PitchedDate and PitchedTime for accurate datetime
                          const pitchedDateRaw = deal?.PitchedDate || deal?.pitchedDate || effectivePitch?.CreatedAt || effectivePitch?.createdAt;
                          const pitchedDateTime = (() => {
                            const dateRaw = pitchedDateRaw;
                            const timeRaw = deal?.PitchedTime || deal?.pitchedTime;
                            if (!dateRaw) return null;
                            try {
                              const d = new Date(dateRaw);
                              if (Number.isNaN(d.getTime())) return null;
                              const sourceRaw = typeof dateRaw === 'string' ? dateRaw : '';
                              const sourceHasTime = /T\d{2}:\d{2}/.test(sourceRaw) || /\d{2}:\d{2}/.test(sourceRaw);
                              const includeTime = Boolean(timeRaw) || sourceHasTime;

                              // If we have a separate time field, extract HH:MM from it
                              if (timeRaw) {
                                const clock = extractClockParts(timeRaw);
                                if (clock) {
                                  d.setUTCHours(clock.hours, clock.minutes, 0, 0);
                                }
                              }
                              const date = formatRelativeDay(d);
                              if (!includeTime) return date;
                              const time = formatUkTime(d);
                              return `${date} ${time}`;
                            } catch { return null; }
                          })();

                          const instructedTimelineRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || null;
                          const instructedTimelineTimeRaw = inst?.SubmissionTime || inst?.submissionTime || inst?.CreatedTime || inst?.createdTime || null;

                          const instructedDateTime = (() => {
                            if (!instructedTimelineRaw) return null;
                            try {
                              const d = new Date(instructedTimelineRaw);
                              if (Number.isNaN(d.getTime())) return null;
                              const sourceRaw = typeof instructedTimelineRaw === 'string' ? instructedTimelineRaw : '';
                              const sourceHasTime = /T\d{2}:\d{2}/.test(sourceRaw) || /\d{2}:\d{2}/.test(sourceRaw);
                              const includeTime = Boolean(instructedTimelineTimeRaw) || sourceHasTime;
                              if (instructedTimelineTimeRaw) {
                                const clock = extractClockParts(instructedTimelineTimeRaw);
                                if (clock) {
                                  d.setUTCHours(clock.hours, clock.minutes, 0, 0);
                                }
                              }
                              const date = formatRelativeDay(d);
                              if (!includeTime) return date;
                              const time = formatUkTime(d);
                              return `${date} ${time}`;
                            } catch {
                              return null;
                            }
                          })();

                          const pitchExpiryRaw = (() => {
                            if (pitchExpiryRawFromSource) return pitchExpiryRawFromSource;
                            if (!pitchedDateRaw) return null;
                            try {
                              const pitchedDate = new Date(pitchedDateRaw);
                              if (Number.isNaN(pitchedDate.getTime())) return null;
                              const inferredExpiry = new Date(pitchedDate.getTime() + (14 * 24 * 60 * 60 * 1000));
                              return inferredExpiry.toISOString();
                            } catch {
                              return null;
                            }
                          })();
                          const pitchExpiry = pitchExpiryRaw ? formatDate(pitchExpiryRaw) : null;

                          const formatShortDuration = (diffMs: number) => {
                            const totalMins = Math.floor(diffMs / 60000);
                            if (totalMins < 1) return '<1m';
                            if (totalMins < 60) return `${totalMins}m`;
                            const hrs = Math.floor(totalMins / 60);
                            if (hrs < 24) {
                              const remMins = totalMins % 60;
                              return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                            }
                            const days = Math.floor(hrs / 24);
                            const remHrs = hrs % 24;
                            return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
                          };

                          const pitchedDateObj = (() => {
                            if (!pitchedDateRaw) return null;
                            const date = new Date(pitchedDateRaw);
                            return Number.isNaN(date.getTime()) ? null : date;
                          })();
                          const instructedDateObj = (() => {
                            const instructedRaw = instructedTimelineRaw && instructedTimelineRaw !== '—' ? instructedTimelineRaw : null;
                            if (!instructedRaw) return null;
                            const date = new Date(instructedRaw);
                            if (!Number.isNaN(date.getTime()) && instructedTimelineTimeRaw) {
                              const t = new Date(instructedTimelineTimeRaw);
                              if (!Number.isNaN(t.getTime())) {
                                date.setHours(t.getHours(), t.getMinutes(), 0, 0);
                              }
                            }
                            return Number.isNaN(date.getTime()) ? null : date;
                          })();
                          const expiryDateObj = (() => {
                            if (!pitchExpiryRaw) return null;
                            const date = new Date(pitchExpiryRaw);
                            return Number.isNaN(date.getTime()) ? null : date;
                          })();

                          const pitchToInstructCue = (() => {
                            if (!pitchedDateObj || !instructedDateObj) return null;
                            const diffMs = Math.abs(instructedDateObj.getTime() - pitchedDateObj.getTime());
                            return {
                              label: formatShortDuration(diffMs),
                              color: isDarkMode ? colours.accent : colours.highlight,
                            };
                          })();

                          const instructToExpiryCue = (() => {
                            if (!expiryDateObj) return null;

                            if (instructedDateObj) {
                              const diffMs = Math.abs(expiryDateObj.getTime() - instructedDateObj.getTime());
                              const withinWindow = instructedDateObj.getTime() <= expiryDateObj.getTime();
                              return {
                                label: withinWindow ? `${formatShortDuration(diffMs)} before` : `${formatShortDuration(diffMs)} late`,
                                color: withinWindow ? colours.green : colours.cta,
                                kind: withinWindow ? 'confirmed-before' : 'confirmed-late',
                              };
                            }

                            const now = new Date();
                            const remainingMs = expiryDateObj.getTime() - now.getTime();
                            const durationLabel = formatShortDuration(Math.abs(remainingMs));
                            if (remainingMs >= 0) {
                              return {
                                label: `${durationLabel} left`,
                                color: isDarkMode ? colours.accent : colours.highlight,
                                kind: 'remaining',
                              };
                            }
                            return {
                              label: `Expired ${durationLabel} ago`,
                              color: colours.cta,
                              kind: 'expired',
                            };
                          })();

                          const hasPitchedChip = Boolean(pitchedDateTime || (pitchDate && pitchDate !== '—' && pitchDate !== '�'));
                          const instructionStageLowerForPitch = String(instructionStage || '').toLowerCase();
                          const hasInstructedStageSignal = (
                            instructionStageLowerForPitch.includes('instruct') ||
                            instructionStageLowerForPitch.includes('matter-opened') ||
                            instructionStageLowerForPitch.includes('matter_opened') ||
                            instructionStageLowerForPitch.includes('proof-of-id') ||
                            instructionStageLowerForPitch.includes('proof_of_id') ||
                            instructionStageLowerForPitch.includes('payment') ||
                            instructionStageLowerForPitch.includes('id check') ||
                            instructionStageLowerForPitch.includes('risk')
                          );
                          const hasInstructedChip = hasInstructedStageSignal && Boolean(instructedDateObj || instructedDateTime);
                          const strikeExpiryChip = hasInstructedChip && Boolean(instructedDateObj);
                          
                          // Flattened layout tokens (matches enquiry section treatment)
                          const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
                          const textBody = isDarkMode ? '#d1d5db' : '#374151';
                          const separatorColor = isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral;

                          // Resolve pitched-by to name via teamData
                          const resolvedPitchedBy = (() => {
                            if (!pitchedBy || pitchedBy === '\ufffd' || pitchedBy === '\u2014') return '\u2014';
                            if (teamData) {
                              const n = pitchedBy.toLowerCase().trim();
                              const match = teamData.find((t: any) => {
                                const em = (t.Email || '').toLowerCase().trim();
                                const init = (t.Initials || '').toLowerCase().trim();
                                const nick = (t.Nickname || '').toLowerCase().trim();
                                return em === n || init === n || nick === n;
                              });
                              if (match) return match['Full Name'] || match.First || pitchedBy;
                            }
                            return pitchedBy;
                          })();

                          // Data bar column (same pattern as enquiry section)
                          const isEmptyVal = (v: string) => !v || v === '\u2014' || v === '\ufffd';
                          const DataCol = ({ label, value, accent, mono, icon: colIcon, maxW, isStruck }: {
                            label: string; value: string; accent?: string; mono?: boolean;
                            icon?: React.ReactNode; maxW?: number;
                            isStruck?: boolean;
                          }) => (
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted }}>{label}</span>
                              <span style={{
                                fontSize: 12, fontWeight: !isEmptyVal(value) ? 500 : 400,
                                color: isStruck ? textMuted : (accent || (!isEmptyVal(value) ? textBody : textMuted)),
                                fontFamily: mono ? 'Raleway, sans-serif' : 'Raleway, sans-serif',
                                display: 'flex', alignItems: 'center', gap: 4,
                                textAlign: 'left',
                                maxWidth: maxW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                textDecoration: isStruck ? 'line-through' : 'none',
                              }}>
                                {colIcon}{isEmptyVal(value) ? '\u2014' : value}
                              </span>
                            </div>
                          );
                          const Sep = () => (
                            <div style={{ width: 1, alignSelf: 'stretch', background: separatorColor, margin: '4px 0' }} />
                          );

                          // Show loading state while fetching pitch content
                          if (isFetchingPitchContent) {
                            return (
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '24px', color: textMuted, fontSize: 12,
                              }}>
                                Loading pitch data...
                              </div>
                            );
                          }

                          // Show empty state if no pitch data
                          if (hasNoPitchData) {
                            return (
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '24px', color: textMuted, fontSize: 12,
                                fontFamily: "'Raleway', 'Segoe UI', sans-serif", gap: 6,
                              }}>
                                <FaEnvelope size={12} style={{ color: textMuted }} />
                                No pitch recorded
                              </div>
                            );
                          }
                          
                          const instructedTimelineColour = instructToExpiryCue?.kind === 'confirmed-late' ? colours.cta : colours.green;
                          const isPitchExpired = !hasInstructedChip && instructToExpiryCue?.kind === 'expired';
                          const pitchHeaderTitle = hasInstructedChip
                            ? 'Deal closed'
                            : isPitchExpired
                              ? 'Pitch expired'
                              : 'Pitch sent';
                          const pitchHeaderDescription = hasInstructedChip
                            ? 'Instruction received — review closed deal details below.'
                            : isPitchExpired
                              ? 'Pitch window elapsed — review expiry details below.'
                              : 'Review details below.';

                          return (
                            <div style={{
                              fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                gap: 8,
                                padding: flatEmbedMode ? '6px 0' : '8px 14px',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ color: headerCueAccent, display: 'flex', alignItems: 'center' }}>
                                    <FaPaperPlane size={12} />
                                  </span>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    color: headerCueAccent,
                                  }}>
                                    {pitchHeaderTitle}
                                  </span>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.78)',
                                    marginLeft: 4,
                                  }}>
                                    {pitchHeaderDescription}
                                  </span>
                                </div>
                              </div>

                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8,
                                padding: flatEmbedMode ? '0 0 2px' : '0 14px 2px', minHeight: 36,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                  {hasPitchedChip && (
                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.03)',
                                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)'}`,
                                      flexShrink: 0,
                                    }}>
                                      <FaClock size={10} style={{ color: textMuted }} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: textBody }}>
                                        Pitched
                                        <span style={{ color: textMuted, fontWeight: 500 }}> · {pitchedDateTime || pitchDate}</span>
                                      </span>
                                    </div>
                                  )}

                                  {hasPitchedChip && hasInstructedChip && (
                                    <div style={{
                                      display: 'flex', alignItems: 'center', width: pitchToInstructCue?.label ? 'auto' : 60,
                                      margin: '0 2px',
                                    }}>
                                      <div style={{
                                        flex: 1, height: 1, minWidth: 12,
                                        background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                      }} />
                                      {pitchToInstructCue?.label && (
                                        <span style={{
                                          fontSize: 9,
                                          fontWeight: isDarkMode ? 700 : 600,
                                          color: textMuted,
                                          opacity: isDarkMode ? 1 : 0.72,
                                          padding: '1px 5px',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {pitchToInstructCue.label}
                                        </span>
                                      )}
                                      <div style={{
                                        flex: 1, height: 1, minWidth: 12,
                                        background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                      }} />
                                    </div>
                                  )}

                                  {hasInstructedChip && (
                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: `${instructedTimelineColour}12`,
                                      border: `1px solid ${instructedTimelineColour}25`,
                                      flexShrink: 0,
                                    }}>
                                      <span style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: instructedTimelineColour, flexShrink: 0,
                                      }} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: instructedTimelineColour }}>
                                        Instructed
                                        {instructedDateTime && <span style={{ color: isDarkMode ? `${instructedTimelineColour}CC` : instructedTimelineColour, fontWeight: 500 }}> · {instructedDateTime}</span>}
                                      </span>
                                    </div>
                                  )}

                                  {!hasInstructedChip && pitchExpiry && (
                                    <div style={{
                                      display: 'flex', alignItems: 'center', width: (instructToExpiryCue?.label && !strikeExpiryChip) ? 'auto' : 44,
                                      margin: '0 2px',
                                    }}>
                                      <div style={{
                                        flex: 1, height: 1, minWidth: 12,
                                        background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                      }} />
                                      {instructToExpiryCue?.label && !strikeExpiryChip && (
                                        <span style={{
                                          fontSize: 9,
                                          fontWeight: isDarkMode ? 700 : 600,
                                          color: textMuted,
                                          opacity: isDarkMode ? 1 : 0.72,
                                          padding: '1px 5px',
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {instructToExpiryCue.label}
                                        </span>
                                      )}
                                      <div style={{
                                        flex: 1, height: 1, minWidth: 12,
                                        background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                      }} />
                                    </div>
                                  )}

                                  {!hasInstructedChip && pitchExpiry && (
                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: strikeExpiryChip
                                        ? (isDarkMode ? 'rgba(160, 160, 160, 0.045)' : 'rgba(107, 107, 107, 0.045)')
                                        : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)'),
                                      border: `1px solid ${strikeExpiryChip
                                        ? (isDarkMode ? 'rgba(160, 160, 160, 0.14)' : 'rgba(107, 107, 107, 0.12)')
                                        : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)')}`,
                                      flexShrink: 0,
                                    }}>
                                      <FaClock size={10} style={{ color: textMuted }} />
                                      <span style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: strikeExpiryChip ? textMuted : textBody,
                                        textDecoration: 'none',
                                        opacity: strikeExpiryChip ? (isDarkMode ? 0.75 : 0.72) : 1,
                                      }}>
                                        {strikeExpiryChip
                                          ? (instructToExpiryCue?.label ? `Expiry window · ${instructToExpiryCue.label}` : `Expiry window · ${pitchExpiry}`)
                                          : `Expires ${pitchExpiry}`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                                borderRadius: 0,
                                padding: '12px 14px',
                              }}>

                              {/* ── Data bar: horizontal columns with vertical separators ── */}
                              <div style={{
                                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0,
                                padding: '14px 0',
                                border: `1px solid ${separatorColor}`,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.4)',
                              }}>
                                <DataCol
                                  label="Area" value={areaOfWork ? areaOfWork.charAt(0).toUpperCase() + areaOfWork.slice(1) : '\u2014'}
                                  icon={
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        background: areaOfWork && areaOfWork !== '\u2014' ? resolveAowAccent(areaOfWork) : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                        boxShadow: areaOfWork && areaOfWork !== '\u2014' ? `0 0 0 1px ${isDarkMode ? 'rgba(0, 3, 25, 0.5)' : 'rgba(255, 255, 255, 0.85)'}` : 'none',
                                        flexShrink: 0,
                                      }}
                                    />
                                  }
                                />
                                <Sep />
                                <DataCol label="Pitched By" value={resolvedPitchedBy} />
                                <Sep />
                                <DataCol label="Deal" value={dealId ? String(dealId) : '\u2014'} mono />
                                {pitchInstructionRef && (
                                  <><Sep /><DataCol label="Ref" value={String(pitchInstructionRef)} mono /></>
                                )}
                                {resolvedPitchPasscode && (
                                  <><Sep /><DataCol label="Passcode" value={String(resolvedPitchPasscode)} mono /></>
                                )}
                                {pitchExpiry && (
                                  <><Sep /><DataCol label="Expiry" value={pitchExpiry} isStruck={hasInstructedChip} /></>
                                )}
                              </div>

                              {/* ── Amount + Service side by side (amount first for fixed width) ── */}
                              <div style={{
                                display: 'flex', alignItems: 'stretch', gap: 0,
                                border: `1px solid ${separatorColor}`,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.15)' : 'rgba(244, 244, 246, 0.25)',
                              }}>
                                {/* Amount + VAT — left, fixed width with accent stripe */}
                                <div style={{
                                  padding: '10px 14px', flexShrink: 0, width: 130,
                                }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                    textTransform: 'uppercase', color: textMuted,
                                  }}>
                                    Amount
                                  </span>
                                  <div style={{
                                    fontSize: 13, fontWeight: 600, marginTop: 4,
                                    color: dealAmount ? textBody : textMuted,
                                  }}>
                                    {dealAmount ? formatMoney(dealAmount) : '\u00a30 / CFA'}
                                  </div>
                                  <div style={{
                                    fontSize: 10, fontWeight: 500, marginTop: 6,
                                    color: textMuted,
                                  }}>
                                    {dealAmount
                                      ? `incl. VAT ${formatMoney(Number(dealAmount) * 1.2)}`
                                      : 'incl. VAT \u00a30.00'}
                                  </div>
                                </div>

                                {/* Separator */}
                                <div style={{ width: 1, alignSelf: 'stretch', background: separatorColor }} />

                                {/* Service / Scenario — right, fills remaining space */}
                                <div style={{ flex: 1, minWidth: 0, padding: '10px 14px' }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                    textTransform: 'uppercase', color: textMuted,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}>
                                    <FaFileAlt size={10} style={{ color: textMuted }} />
                                    Service
                                  </span>
                                  <div style={{
                                    fontSize: 12, lineHeight: 1.6, marginTop: 4,
                                    color: dealScenario ? textBody : textMuted,
                                    whiteSpace: 'pre-wrap',
                                  }}>
                                    {dealScenario || '\u2014'}
                                  </div>
                                </div>
                              </div>

                              {/* ── Pitch link bar (below amount, matching instructed pattern) ── */}
                              {resolvedPitchPasscode && (
                                <div style={{
                                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
                                  padding: '6px 14px',
                                  background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                                  border: `1px solid ${separatorColor}`,
                                }}>
                                  {(() => {
                                    const pitchLinkStatus = hasInstructedChip ? 'Instructed' : (isPitchExpired ? 'Expired' : 'Pending');
                                    const pitchLinkColor = hasInstructedChip
                                      ? colours.green
                                      : isPitchExpired
                                        ? colours.cta
                                        : (isDarkMode ? colours.accent : colours.highlight);
                                    const checkoutLabel = hasPitchContent ? 'Pitch Link' : 'Checkout Link (via link)';
                                    return (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 5,
                                          padding: '5px 10px', borderRadius: 0,
                                          background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.03)',
                                          border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)'}`,
                                          color: textMuted,
                                          fontSize: 10,
                                          fontWeight: 700,
                                        }}>
                                          <FaLink size={10} />
                                          {checkoutLabel}
                                        </span>

                                        <a
                                          href={`https://instruct.helix-law.com/pitch/${resolvedPitchPasscode}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            showToast({ type: 'success', message: 'Opening pitch link' });
                                          }}
                                          title={`Open pitch page: instruct.helix-law.com/pitch/${resolvedPitchPasscode}`}
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '5px 10px', borderRadius: 0,
                                            background: hasInstructedChip
                                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)')
                                              : isPitchExpired
                                                ? (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)')
                                                : (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.05)'),
                                            border: `1px solid ${hasInstructedChip
                                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)')
                                              : isPitchExpired
                                                ? (isDarkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.15)')
                                                : (isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.15)')}`,
                                            color: pitchLinkColor,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = isDarkMode ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(6,23,51,0.12)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                          }}
                                        >
                                          <span style={{ fontFamily: 'Raleway, sans-serif', opacity: 0.95 }}>instruct.helix-law.com/pitch/{resolvedPitchPasscode}</span>
                                        </a>


                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void safeCopy(`https://instruct.helix-law.com/pitch/${resolvedPitchPasscode}`);
                                            showToast({ type: 'success', message: 'Pitch link copied' });
                                          }}
                                          title="Copy pitch link"
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 24, height: 24,
                                            borderRadius: 0,
                                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(0,0,0,0.08)'}`,
                                            background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.02)',
                                            color: textMuted,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = pitchLinkColor;
                                            e.currentTarget.style.color = pitchLinkColor;
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(0,0,0,0.08)';
                                            e.currentTarget.style.color = textMuted;
                                          }}
                                        >
                                          <FaCopy size={10} />
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* ── Pitch content / link generation confirmation ── */}
                              {(() => {
                                // If we have pitch email content, show it
                                if (hasPitchContent) {
                                  const needsExpansion = cleanEmailBody && cleanEmailBody.length > 300;
                                  const displayBody = isPitchContentExpanded || !needsExpansion
                                    ? cleanEmailBody
                                    : `${cleanEmailBody.slice(0, 300)}...`;
                                  return (
                                    <div>
                                      <div style={{
                                        display: 'flex', alignItems: 'center', padding: '4px 10px 3px',
                                      }}>
                                        <span style={{
                                          fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                          textTransform: 'uppercase',
                                          color: isDarkMode ? colours.accent : colours.highlight,
                                          display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                          <FaEnvelope size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
                                          Pitch Content
                                        </span>
                                      </div>
                                      <div style={{
                                        fontSize: 12, lineHeight: 1.6, color: textBody,
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: isPitchContentExpanded ? undefined : 180,
                                        overflowY: isPitchContentExpanded ? undefined : ('auto' as const),
                                        padding: '8px 14px',
                                        margin: '4px 0 10px',
                                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                        border: `1px solid ${separatorColor}`,
                                      }}>
                                        {pitchEmailSubject && (
                                          <div style={{ fontWeight: 600, marginBottom: cleanEmailBody ? 8 : 0 }}>
                                            {pitchEmailSubject}
                                          </div>
                                        )}
                                        {cleanEmailBody && <div style={{ opacity: 0.85 }}>{displayBody}</div>}
                                        {needsExpansion && (
                                          <div
                                            onClick={(e) => { e.stopPropagation(); setIsPitchContentExpanded(prev => !prev); }}
                                            style={{
                                              marginTop: 8, fontSize: 11, fontWeight: 500,
                                              color: colours.highlight, cursor: 'pointer', display: 'inline-block',
                                            }}
                                          >
                                            {isPitchContentExpanded ? 'Show less' : 'Show more'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                // If we have pitch notes (but no email content), show notes
                                if (pitchNotes) {
                                  return (
                                    <div>
                                      <div style={{
                                        display: 'flex', alignItems: 'center', padding: '4px 10px 3px',
                                      }}>
                                        <span style={{
                                          fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                          textTransform: 'uppercase',
                                          color: isDarkMode ? colours.accent : colours.highlight,
                                          display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                          <FaEdit size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
                                          Pitch Notes
                                        </span>
                                      </div>
                                      <div style={{
                                        fontSize: 12, lineHeight: 1.6, color: textBody,
                                        whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
                                        padding: '8px 14px',
                                        margin: '4px 0 10px',
                                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                        border: `1px solid ${separatorColor}`,
                                      }}>
                                        {pitchNotes}
                                      </div>
                                    </div>
                                  );
                                }

                                // No pitch content — confirm link generation
                                return null;
                              })()}
                              </div>
                            </div>
                          );
                        }

                        // Instructed context - show instruction data in rich layout like enquiry/pitch (instruction-only)
                        // Core instruction fields
                        const instInternalStatus = String(inst?.InternalStatus ?? inst?.internalStatus ?? '').trim();
                        const instClientId = inst?.ClientId || inst?.clientId || '';
                        const instRelatedClientId = inst?.RelatedClientId || inst?.relatedClientId || '';
                        const instConsent = inst?.ConsentGiven === true ? 'Yes' : inst?.ConsentGiven === false ? 'No' : '—';
                        
                        let instIdType = String(inst?.IdType ?? inst?.IDType ?? getValue(['IDType', 'id_type', 'IdType'], '')).trim();
                        if ((!instIdType || instIdType === '—') && ((passport && passport !== '—') || (license && license !== '—'))) {
                          if (passport && passport !== '—') instIdType = 'Passport';
                          else if (license && license !== '—') instIdType = 'Driving License';
                        }
                        
                        const instNotesRaw = String(inst?.Notes ?? '').trim();
                        const instNotes = instNotesRaw.length > 0 ? instNotesRaw : '';
                        const instLastUpdatedRaw = inst?.LastUpdated || inst?.lastUpdated || null;
                        const instLastUpdated = instLastUpdatedRaw ? formatDate(instLastUpdatedRaw) : null;
                        
                        // Personal details from instruction
                        const instTitle = String(inst?.Title ?? inst?.title ?? '').trim();
                        const instFirstName = String(inst?.FirstName ?? inst?.firstName ?? firstName ?? '').trim();
                        const instLastName = String(inst?.LastName ?? inst?.lastName ?? lastName ?? '').trim();
                        const instFullName = [instTitle, instFirstName, instLastName].filter(Boolean).join(' ') || fullName;
                        const instGender = (() => {
                          const raw = String(inst?.Gender ?? inst?.gender ?? inst?.Sex ?? inst?.sex ?? gender ?? '').trim();
                          return (!raw || raw === '\ufffd' || raw === '\u2014') ? '\u2014' : raw;
                        })();
                        const instNationality = String(inst?.Nationality ?? inst?.nationality ?? nationalityFull ?? '').trim();
                        const instNationalityAlpha = String(inst?.NationalityAlpha2 ?? inst?.nationalityAlpha2 ?? nationalityAlpha ?? '').trim();
                        const instDobRaw = inst?.DOB || inst?.dob || inst?.DateOfBirth || dobRaw;
                        const instDob = instDobRaw ? formatDate(instDobRaw) : dob;
                        const instAge = (() => {
                          if (!instDobRaw || instDobRaw === '—') return age;
                          const parsed = new Date(instDobRaw);
                          if (Number.isNaN(parsed.getTime())) return age;
                          const diff = Date.now() - parsed.getTime();
                          const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
                          return String(years);
                        })();
                        
                        // Contact from instruction
                        const instEmail = String(inst?.Email ?? inst?.email ?? email ?? '').trim();
                        const instPhone = String(inst?.Phone ?? inst?.phone ?? inst?.Telephone ?? phone ?? '').trim();
                        
                        // ID Documents from instruction
                        const instPassportNumber = String(inst?.PassportNumber ?? inst?.passportNumber ?? passport ?? '').trim();
                        const instDriversLicense = String(inst?.DriversLicenseNumber ?? inst?.driversLicenseNumber ?? license ?? '').trim();
                        const hasIdDocuments = (instPassportNumber && instPassportNumber !== '—') || (instDriversLicense && instDriversLicense !== '—');
                        
                        // Individual Address from instruction
                        const instHouseNumber = String(inst?.HouseNumber ?? inst?.houseNumber ?? houseNum ?? '').trim();
                        const instStreet = String(inst?.Street ?? inst?.street ?? street ?? '').trim();
                        const instCity = String(inst?.City ?? inst?.city ?? city ?? '').trim();
                        const instCounty = String(inst?.County ?? inst?.county ?? county ?? '').trim();
                        const instPostcode = String(inst?.Postcode ?? inst?.postcode ?? postcode ?? '').trim();
                        const instCountry = String(inst?.Country ?? inst?.country ?? country ?? '').trim();
                        const instCountryCode = String(inst?.CountryCode ?? inst?.countryCode ?? '').trim();
                        const instAddressParts = [
                          instHouseNumber && instStreet ? `${instHouseNumber} ${instStreet}` : instStreet || instHouseNumber,
                          instCity,
                          instCounty,
                          instPostcode,
                          instCountry
                        ].filter(v => v && v !== '—' && v !== '—');
                        const instFullAddress = instAddressParts.join(', ') || '—';
                        const hasIndividualAddress = instAddressParts.length > 0;
                        
                        // Company details from instruction
                        const instCompanyName = String(inst?.CompanyName ?? inst?.companyName ?? companyName ?? '').trim();
                        const instCompanyNumber = String(inst?.CompanyNumber ?? inst?.companyNumber ?? companyNo ?? '').trim();
                        const instCompanyHouseNum = String(inst?.CompanyHouseNumber ?? inst?.companyHouseNumber ?? '').trim();
                        const instCompanyStreet = String(inst?.CompanyStreet ?? inst?.companyStreet ?? '').trim();
                        const instCompanyCity = String(inst?.CompanyCity ?? inst?.companyCity ?? '').trim();
                        const instCompanyCounty = String(inst?.CompanyCounty ?? inst?.companyCounty ?? '').trim();
                        const instCompanyPostcode = String(inst?.CompanyPostcode ?? inst?.companyPostcode ?? '').trim();
                        const instCompanyCountry = String(inst?.CompanyCountry ?? inst?.companyCountry ?? '').trim();
                        const instCompanyCountryCode = String(inst?.CompanyCountryCode ?? inst?.companyCountryCode ?? '').trim();
                        const instCompanyAddressParts = [
                          instCompanyHouseNum && instCompanyStreet ? `${instCompanyHouseNum} ${instCompanyStreet}` : instCompanyStreet || instCompanyHouseNum,
                          instCompanyCity,
                          instCompanyCounty,
                          instCompanyPostcode,
                          instCompanyCountry
                        ].filter(v => v && v !== '—' && v !== '—');
                        const instCompanyFullAddress = instCompanyAddressParts.join(', ') || '—';
                        const hasCompanyDetails = (instCompanyName && instCompanyName !== '—' && instCompanyName !== '—') || (instCompanyNumber && instCompanyNumber !== '—' && instCompanyNumber !== '—');
                        
                        // Passcode for checkout link
                        const instPasscode = deal?.Passcode || deal?.passcode || inst?.Passcode || inst?.passcode || '';
                        const checkoutUrl = instPasscode ? `https://instruct.helix-law.com/pitch/${instPasscode}` : '';
                        
                        // Instruction datetime
                        const instructionDateTime = (() => {
                          const dateRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || inst?.createdAt || null;
                          if (!dateRaw) return null;
                          try {
                            const d = new Date(dateRaw);
                            if (Number.isNaN(d.getTime())) return null;
                            const timeRaw = inst?.SubmissionTime || inst?.submissionTime || inst?.CreatedTime || inst?.createdTime || null;
                            if (timeRaw) {
                              const t = new Date(timeRaw);
                              if (!Number.isNaN(t.getTime())) {
                                const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                return `${formatRelativeDay(d)} ${time}`;
                              }
                            }
                            return formatRelativeDay(d);
                          } catch {
                            return null;
                          }
                        })();
                        
                        // Determine instruction status label (instruction-specific stage, not matter status)
                        const instStatusLabel = (() => {
                          const stage = instructionStage.toLowerCase();
                          if (stage.includes('matter-opened') || stage.includes('matter_opened') || stage.includes('matter opened')) return 'Instructed';
                          if (stage.includes('proof-of-id') || stage.includes('proof_of_id')) return 'Proof-of-ID';
                          if (stage.includes('complet')) return 'Completed';
                          if (stage.includes('active') || stage.includes('progress')) return 'In Progress';
                          if (stage.includes('initiali')) return 'Initialised';
                          if (stage.includes('instruct')) return 'Instructed';
                          if (stage) return instructionStage;
                          return 'Instructed';
                        })();
                        
                        // Status color based on instruction stage
                        const instStatusColor = (() => {
                          const stage = instructionStage.toLowerCase();
                          if (stage.includes('complet')) return colours.green;
                          if (stage.includes('active') || stage.includes('progress')) return colours.highlight;
                          if (stage.includes('initiali')) return colours.orange;
                          return colours.highlight;
                        })();
                        
                        // Payment data for instructed context
                        const instPayment = firstSuccessfulPayment;
                        const instPaymentStatus = instPayment ? 'Paid' : (instInternalStatus === 'paid' ? 'Paid' : 'Unpaid');
                        const instPaymentDate = paymentDate !== '—' ? paymentDate : null;
                        const instPaymentMethodRaw = (() => {
                          if (!instPayment) return '';
                          const methodRaw = (
                            instPayment.payment_method || instPayment.payment_type || instPayment.method || 
                            instPayment.type || instPayment.paymentMethod || instPayment.PaymentMethod || instPayment.PaymentType || ''
                          ).toString().toLowerCase();
                          const meta = typeof instPayment.metadata === 'object' ? instPayment.metadata : {};
                          const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
                          const intentId = (instPayment.payment_intent_id || instPayment.paymentIntentId || '').toString();
                          const intentIsBank = intentId.startsWith('bank_');
                          const intentIsCard = intentId.startsWith('pi_');
                          return methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
                        })();
                        const instPaymentIsCard = instPaymentMethodRaw.includes('card') || instPaymentMethodRaw.includes('stripe') || instPaymentMethodRaw === 'cc' || (instPayment?.payment_intent_id || '').startsWith('pi_');
                        const instPaymentIsBank = instPaymentMethodRaw.includes('bank') || instPaymentMethodRaw.includes('transfer') || instPaymentMethodRaw.includes('bacs') || instPaymentMethodRaw.includes('ach') || (instPayment?.payment_intent_id || '').startsWith('bank_');

                        // Amount + Service (same source chain as pitch)
                        const instAmount = inst?.Amount || inst?.amount || deal?.Amount || deal?.amount || deal?.FeeAmount || deal?.feeAmount || effectivePitch?.Amount || effectivePitch?.amount || '';
                        const instService = inst?.ServiceDescription || inst?.serviceDescription || effectivePitch?.scenarioLabel || effectivePitch?.scenario || effectivePitch?.ServiceDescription || deal?.ServiceDescription || deal?.serviceDescription || '';

                        // Layout tokens (matching enquiry/pitch)
                        const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
                        const textBody = isDarkMode ? '#d1d5db' : '#374151';
                        const separatorColor = isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral;

                        // DataCol + Sep (same pattern as enquiry/pitch)
                        const isEmptyVal = (v: string) => !v || v === '\u2014' || v === '\ufffd';
                        const DataCol = ({ label, value, accent, mono, icon: colIcon, maxW }: {
                          label: string; value: string; accent?: string; mono?: boolean;
                          icon?: React.ReactNode; maxW?: number;
                        }) => (
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 34, gap: 4, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted }}>{label}</span>
                            <span style={{
                              fontSize: 12, fontWeight: !isEmptyVal(value) ? 500 : 400,
                              color: accent || (!isEmptyVal(value) ? textBody : textMuted),
                              fontFamily: mono ? 'Raleway, sans-serif' : 'Raleway, sans-serif',
                              display: 'flex', alignItems: 'center', gap: 4,
                              textAlign: 'left',
                              maxWidth: maxW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {colIcon}{isEmptyVal(value) ? '\u2014' : value}
                            </span>
                          </div>
                        );
                        const Sep = () => (
                          <div style={{ width: 1, alignSelf: 'stretch', background: separatorColor, margin: '4px 0' }} />
                        );

                        // Elapsed duration: pitch → instruction
                        const pitchToInstElapsed = (() => {
                          const instDateRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || inst?.createdAt || null;
                          if (!pitchDateRaw || !instDateRaw) return null;
                          try {
                            const start = new Date(pitchDateRaw);
                            const end = new Date(instDateRaw);
                            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
                            const diffMs = end.getTime() - start.getTime();
                            if (diffMs < 0) return null;
                            const mins = Math.floor(diffMs / 60000);
                            if (mins < 1) return '<1m';
                            if (mins < 60) return `${mins}m`;
                            const hrs = Math.floor(mins / 60);
                            const remMins = mins % 60;
                            if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                            const days = Math.floor(hrs / 24);
                            const remHrs = hrs % 24;
                            return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
                          } catch { return null; }
                        })();
                        const hasPitchedTimelineChip = Boolean(pitchDate && pitchDate !== '\u2014' && pitchDate !== '\ufffd');
                        const hasInstructionTimelineChip = Boolean(instructionDateTime);
                        const showPitchToInstructionConnector = hasPitchedTimelineChip && hasInstructionTimelineChip;

                        const instructionHeaderPrompt = 'Review details below.';

                        return (
                          <div style={{
                            fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              gap: 8,
                              padding: flatEmbedMode ? '6px 0' : '8px 14px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: headerCueAccent, display: 'flex', alignItems: 'center' }}>
                                  <FaCheckCircle size={12} />
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  color: headerCueAccent,
                                }}>
                                  Instruction received
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.78)',
                                  marginLeft: 4,
                                }}>
                                  {instructionHeaderPrompt}
                                </span>
                              </div>
                            </div>

                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                              padding: flatEmbedMode ? '0 0 2px' : '0 14px 2px', minHeight: 36,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                {hasPitchedTimelineChip && (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 10px', borderRadius: 0,
                                    background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.03)',
                                    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)'}`,
                                    flexShrink: 0,
                                  }}>
                                    <FaClock size={10} style={{ color: textMuted }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: textBody }}>
                                      Pitched
                                      <span style={{ color: textMuted, fontWeight: 500 }}> · {pitchDate}</span>
                                    </span>
                                  </div>
                                )}

                                {showPitchToInstructionConnector && (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', width: pitchToInstElapsed ? 'auto' : 60,
                                    margin: '0 2px',
                                  }}>
                                    <div style={{
                                      flex: 1, height: 1, minWidth: 12,
                                      background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                    }} />
                                    {pitchToInstElapsed && (
                                      <span style={{
                                        fontSize: 9,
                                        fontWeight: isDarkMode ? 700 : 600,
                                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                        opacity: isDarkMode ? 1 : 0.72,
                                        padding: '1px 5px', whiteSpace: 'nowrap',
                                      }}>
                                        {pitchToInstElapsed}
                                      </span>
                                    )}
                                    <div style={{
                                      flex: 1, height: 1, minWidth: 12,
                                      background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                                    }} />
                                  </div>
                                )}

                                {instructionDateTime && (
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 10px', borderRadius: 0,
                                    background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)'}`,
                                    flexShrink: 0,
                                  }}>
                                    <FaCheckCircle size={10} style={{ color: colours.green }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: colours.green }}>
                                      Instructed
                                      <span style={{ color: isDarkMode ? 'rgba(32, 178, 108, 0.8)' : 'rgba(32, 178, 108, 0.9)', fontWeight: 500 }}> · {instructionDateTime}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                              background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                              borderRadius: 0,
                              padding: '12px 14px',
                            }}>

                            {/* ── Data bar: horizontal columns with vertical separators ── */}
                            <div style={{
                              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0,
                              padding: '14px 0',
                              borderTop: `1px solid ${separatorColor}`,
                              borderBottom: `1px solid ${separatorColor}`,
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.4)',
                            }}>
                              <DataCol
                                label="Type" value={clientType || '\u2014'}
                                icon={clientType && clientType !== '\u2014' && (clientType.toLowerCase().includes('company') || clientType.toLowerCase().includes('business') || clientType.toLowerCase().includes('corporate'))
                                  ? <FaBuilding size={10} style={{ opacity: 0.7 }} />
                                  : <FaUser size={10} style={{ opacity: 0.7 }} />}
                              />
                              <Sep />
                              <DataCol
                                label="Client"
                                value={clientType && (clientType.toLowerCase().includes('company') || clientType.toLowerCase().includes('business') || clientType.toLowerCase().includes('corporate'))
                                  ? (instCompanyName || instFullName || '\u2014')
                                  : (instFullName || '\u2014')}
                              />
                              <Sep />
                              {(() => {
                                // Resolve initials → full name via teamData (also check inst-level fields)
                                const isMissing = (v: any) => !v || v === '\u2014' || v === '\ufffd' || String(v).trim() === '';
                                const rawFe = !isMissing(feeEarner)
                                  ? feeEarner
                                  : (inst?.HelixContact || inst?.helixContact || inst?.FeeEarner || inst?.feeEarner || inst?.Solicitor || inst?.solicitor || deal?.pitchedBy || deal?.PitchedBy || effectivePitch?.pitchedBy || effectivePitch?.CreatedBy || '');
                                const feName = (() => {
                                  const fe = String(rawFe || '').trim();
                                  if (!fe || fe === '\ufffd' || fe === '\u2014') return '\u2014';
                                  if (!teamData) return fe;
                                  const match = teamData.find((t: any) =>
                                    t['Full Name']?.toLowerCase() === fe.toLowerCase() ||
                                    t['Nickname']?.toLowerCase() === fe.toLowerCase() ||
                                    t['Initials']?.toLowerCase() === fe.toLowerCase()
                                  );
                                  return match?.['Full Name'] || match?.['Nickname'] || fe;
                                })();
                                return <DataCol label="Fee Earner" value={feName} />;
                              })()}
                              <Sep />
                              <DataCol label="Stage" value={instructionStage || matterStatus || '\u2014'} />
                              <Sep />
                              <DataCol
                                label="Payment"
                                value={
                                  instPaymentStatus === 'Paid'
                                    ? instPaymentIsBank
                                      ? `Confirmed${instPaymentDate ? ` ${instPaymentDate}` : ''}`
                                      : instPaymentDate ? `Paid ${instPaymentDate}` : 'Paid'
                                    : instPaymentStatus
                                }
                                accent={
                                  instPaymentStatus === 'Paid'
                                    ? instPaymentIsBank ? colours.orange : undefined
                                    : undefined
                                }
                                icon={instPaymentStatus === 'Paid' ? (
                                  instPaymentIsCard ? <FaCreditCard size={10} style={{ opacity: 0.8 }} />
                                  : instPaymentIsBank ? <FaBuilding size={10} style={{ opacity: 0.8 }} />
                                  : undefined
                                ) : undefined}
                              />
                              <Sep />
                              <DataCol
                                label="Consent"
                                value="Given"
                                icon={<FaCheck size={9} />}
                              />
                            </div>

                            {isCompany && (
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                alignSelf: 'flex-start',
                                padding: '5px 10px',
                                borderRadius: 0,
                                background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                                border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                                borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                                color: isDarkMode ? 'rgba(243, 244, 246, 0.88)' : '#475569',
                                fontSize: 10,
                                fontWeight: 600,
                              }}>
                                <Icon iconName="Info" styles={{ root: { fontSize: 10, color: isDarkMode ? colours.accent : colours.highlight } }} />
                                <span>Company client</span>
                              </div>
                            )}

                            {/* ── Amount + Service side by side (matching pitch layout) ── */}
                            <div style={{
                              display: 'flex', alignItems: 'stretch', gap: 0,
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.15)' : 'rgba(244, 244, 246, 0.25)',
                            }}>
                              {/* Amount + VAT — left, fixed width with accent stripe */}
                              <div style={{
                                padding: '10px 14px', flexShrink: 0, width: 130,
                              }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                  textTransform: 'uppercase', color: textMuted,
                                }}>
                                  Amount
                                </span>
                                <div style={{
                                  fontSize: 13, fontWeight: 600, marginTop: 4,
                                  color: instAmount ? textBody : textMuted,
                                }}>
                                  {instAmount ? formatMoney(instAmount) : '\u00a30 / CFA'}
                                </div>
                                <div style={{
                                  fontSize: 10, fontWeight: 500, marginTop: 6,
                                  color: textMuted,
                                }}>
                                  {instAmount
                                    ? `incl. VAT ${formatMoney(Number(instAmount) * 1.2)}`
                                    : 'incl. VAT \u00a30.00'}
                                </div>
                              </div>

                              {/* Separator */}
                              <div style={{ width: 1, alignSelf: 'stretch', background: separatorColor }} />

                              {/* Service — right, fills remaining space */}
                              <div style={{ flex: 1, minWidth: 0, padding: '10px 14px' }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                  textTransform: 'uppercase', color: textMuted,
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                  <FaFileAlt size={10} style={{ color: textMuted }} />
                                  Service
                                </span>
                                <div style={{
                                  fontSize: 12, lineHeight: 1.6, marginTop: 4,
                                  color: instService ? textBody : textMuted,
                                  whiteSpace: 'pre-wrap',
                                }}>
                                  {instService || '\u2014'}
                                </div>
                              </div>
                            </div>

                            {/* ── Link + Ref bar ── */}
                            {(checkoutUrl || instructionRef) && (
                              <div style={{
                                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
                                padding: '6px 14px',
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                                borderTop: `1px solid ${separatorColor}`,
                              }}>
                                {checkoutUrl && instPasscode && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.03)',
                                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)'}`,
                                      color: textMuted,
                                      fontSize: 10,
                                      fontWeight: 700,
                                    }}>
                                      <FaLink size={10} />
                                      Checkout Link
                                    </span>

                                    <a
                                      href={checkoutUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showToast({ type: 'success', message: 'Opening checkout link' });
                                      }}
                                      title={`Open instruct page: instruct.helix-law.com/pitch/${instPasscode}`}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '5px 10px', borderRadius: 0,
                                        background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)',
                                        border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)'}`,
                                        color: colours.green,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        textDecoration: 'none',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = isDarkMode ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(6,23,51,0.12)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }}
                                    >
                                      <span style={{ fontFamily: 'Raleway, sans-serif', opacity: 0.95 }}>instruct.helix-law.com/pitch/{instPasscode}</span>
                                    </a>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void safeCopy(checkoutUrl);
                                        showToast({ type: 'success', message: 'Checkout link copied' });
                                      }}
                                      title="Copy checkout link"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 24, height: 24,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(0,0,0,0.08)'}`,
                                        background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.02)',
                                        color: textMuted,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = colours.green;
                                        e.currentTarget.style.color = colours.green;
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(0,0,0,0.08)';
                                        e.currentTarget.style.color = textMuted;
                                      }}
                                    >
                                      <FaCopy size={10} />
                                    </button>
                                  </div>
                                )}
                                {instructionRef && (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void safeCopy(String(instructionRef));
                                      showToast({ type: 'success', message: 'Instruction reference copied' });
                                    }}
                                    title="Click to copy instruction reference"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 0,
                                      background: isDarkMode ? 'rgba(160, 160, 160, 0.06)' : 'rgba(0,0,0,0.02)',
                                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)'}`,
                                      fontSize: 10, fontWeight: 600, fontFamily: 'Raleway, sans-serif',
                                      color: textBody, cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.25)';
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0,0,0,0.06)';
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(160, 160, 160, 0.06)' : 'rgba(0,0,0,0.02)';
                                    }}
                                  >
                                    <Icon iconName="Tag" styles={{ root: { fontSize: 10, color: textMuted } }} />
                                    <span>Instruction</span>
                                    <span style={{ opacity: 0.92 }}>{instructionRef}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 2, opacity: 0.85 }} title="Click to copy">
                                      <FaCopy size={9} />
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* ── Individual section ── */}
                            <div style={{
                              borderTop: `1px solid ${separatorColor}`,
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.2)' : 'rgba(244, 244, 246, 0.3)',
                            }}>
                                {/* Header */}
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  padding: '8px 0 6px',
                                  borderBottom: `1px solid ${separatorColor}`,
                                }}>
                                  <FaUser size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                    textTransform: 'uppercase',
                                    color: isDarkMode ? colours.accent : colours.highlight,
                                  }}>
                                    Individual
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: textBody, marginLeft: 'auto' }}>
                                    {instFullName}
                                  </span>
                                </div>

                                {/* Identity fields — flex row with separators */}
                                <div style={{
                                  display: 'flex', flexWrap: 'wrap', alignItems: 'stretch',
                                  gap: 0, padding: '10px 0',
                                }}>
                                  <DataCol label="DOB" value={`${instDob || '\u2014'}${instAge && instAge !== '\u2014' ? ` (${instAge})` : ''}`} />
                                  <Sep />
                                  <DataCol label="Gender" value={instGender || '\u2014'} />
                                  <Sep />
                                  <DataCol label="Nationality" value={instNationality || '\u2014'} />
                                  <Sep />
                                  <DataCol
                                    label="ID Type" value={instIdType || '\u2014'}
                                    icon={instIdType?.toLowerCase().includes('passport') ? <FaPassport size={10} style={{ opacity: 0.6 }} /> : undefined}
                                  />
                                  <Sep />
                                  <DataCol
                                    label={instIdType?.toLowerCase().includes('licen') ? 'License No.' : 'Passport No.'}
                                    value={instIdType?.toLowerCase().includes('licen') ? (instDriversLicense || '\u2014') : (instPassportNumber || '\u2014')}
                                    mono
                                  />
                                  {instRelatedClientId && (<>
                                    <Sep />
                                    <DataCol label="Related Client" value={instRelatedClientId} mono />
                                  </>)}
                                </div>

                                {/* Address */}
                                {hasIndividualAddress && (
                                  <div style={{
                                    padding: '6px 14px 10px',
                                  }}>
                                    <div style={{
                                      display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3,
                                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted,
                                    }}>
                                      <FaHome size={10} style={{ color: textMuted }} />
                                      Address
                                    </div>
                                    <span
                                      onClick={(e) => { e.stopPropagation(); void safeCopy(instFullAddress); }}
                                      style={{ fontSize: 12, fontWeight: 500, color: textBody, cursor: 'pointer', lineHeight: 1.5 }}>
                                      {instFullAddress}
                                    </span>
                                  </div>
                                )}
                            </div>

                            {/* ── Company section ── */}
                            {hasCompanyDetails && (
                              <div style={{
                                borderTop: `1px solid ${separatorColor}`,
                                background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(214, 232, 255, 0.15)',
                              }}>
                                  {/* Header */}
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '8px 0 6px',
                                    borderBottom: `1px solid ${separatorColor}`,
                                  }}>
                                    <FaBuilding size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                      textTransform: 'uppercase',
                                      color: isDarkMode ? colours.accent : colours.highlight,
                                    }}>
                                      Company
                                    </span>
                                    {clientType?.toLowerCase().includes('company') && (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '1px 6px',
                                        borderRadius: 0,
                                        fontSize: 8,
                                        fontWeight: 700,
                                        letterSpacing: '0.4px',
                                        textTransform: 'uppercase',
                                        background: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.28)' : 'rgba(54, 144, 206, 0.18)'}`,
                                        color: isDarkMode ? colours.accent : colours.highlight,
                                      }}>
                                        Client
                                      </span>
                                    )}
                                  </div>

                                  {/* Company fields */}
                                  <div style={{
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'stretch',
                                    gap: 0, padding: '10px 0',
                                  }}>
                                    {instCompanyName && <DataCol label="Name" value={instCompanyName} />}
                                    {instCompanyName && instCompanyNumber && <Sep />}
                                    {instCompanyNumber && <DataCol label="Company No." value={instCompanyNumber} mono />}
                                  </div>

                                  {/* Company address */}
                                  {instCompanyAddressParts.length > 0 && (
                                    <div style={{
                                      padding: '6px 14px 10px',
                                    }}>
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3,
                                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted,
                                      }}>
                                        <FaBuilding size={9} style={{ color: textMuted }} />
                                        Address
                                      </div>
                                      <div
                                        onClick={(e) => { e.stopPropagation(); void safeCopy(instCompanyFullAddress); }}
                                        style={{ fontSize: 12, fontWeight: 500, color: textBody, cursor: 'pointer', lineHeight: 1.5 }}>
                                        {instCompanyFullAddress}
                                        {instCompanyCountryCode && instCompanyCountryCode !== instCompanyCountry && <span style={{ marginLeft: 6, fontSize: 10, color: textMuted }}>({instCompanyCountryCode})</span>}
                                      </div>
                                    </div>
                                  )}
                              </div>
                            )}

                            {/* ── Instruction notes (subtle box) ── */}
                            {instNotes && (
                              <div>
                                <div style={{
                                  display: 'flex', alignItems: 'center', padding: '4px 10px 3px',
                                }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                                    textTransform: 'uppercase', color: textMuted,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}>
                                    <FaFileAlt size={10} style={{ color: textMuted }} />
                                    Instruction Notes
                                  </span>
                                </div>
                                <div style={{
                                  fontSize: 12, lineHeight: 1.6, color: textBody,
                                  whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
                                  padding: '8px 10px',
                                  margin: '4px 10px 10px',
                                  background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                  border: `1px solid ${separatorColor}`,
                                }}>
                                  {instNotes}
                                </div>
                              </div>
                            )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Enquiry notes (collapsed by default, like table view) */}
                    {/* Show notes only for instructed context - enquiry has its own notes, pitch has pitch content */}
                    {hasEnquiryNotes && (activeContextStage ?? 'enquiry') === 'instructed' && (
                      <div style={{ marginTop: 10 }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEnquiryNotesExpanded((prev) => !prev);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            cursor: 'pointer',
                            padding: '8px 10px',
                            background: isDarkMode ? 'rgba(160, 160, 160, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          }}
                          title={isEnquiryNotesExpanded ? 'Collapse notes' : 'Show notes'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 0,
                                background: isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(160, 160, 160, 0.08)',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.3)' : 'rgba(160, 160, 160, 0.2)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Icon
                                iconName={isEnquiryNotesExpanded ? 'ChevronUp' : 'ChevronDown'}
                                styles={{
                                  root: {
                                    fontSize: 10,
                                    color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                                  },
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: '0.5px',
                                  textTransform: 'uppercase',
                                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                  lineHeight: 1,
                                }}
                              >
                                Notes
                              </div>
                              {!isEnquiryNotesExpanded && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.55)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 520,
                                  }}
                                >
                                  {enquiryNotes.replace(/\n+/g, ' ').trim()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {isEnquiryNotesExpanded && (
                          <div
                            style={{
                              padding: '12px 12px',
                              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.008)',
                              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                              borderTop: 'none',
                              fontSize: 11,
                              lineHeight: '1.5',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)',
                              whiteSpace: 'pre-line',
                            }}
                          >
                            {enquiryNotes.replace(/\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </>
              );
            })()}


            {/* NOTE: Pitch content is rendered in the header card above when contextStage === 'pitch' */}

            {/* Instruction Reference bar (only for instructed view - pitch shows refs in its own layout) */}
          </div>
        )}

        {/* Identity Tab - ID Verification */}
        {activeTab === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              identityBannerStatus === 'complete' 
                ? (isManuallyApproved ? 'ID Approved' : 'ID Verified')
                : identityBannerStatus === 'review' ? 'ID Needs Review' : 'ID Pending',
              identityBannerStatus,
              identityBannerStatus === 'complete'
                ? (isManuallyApproved && hasUnderlyingIssues 
                    ? 'Manually approved despite individual check issues (see below).'
                    : 'Verification complete.')
                : identityBannerStatus === 'review'
                  ? 'Review required. Approve or request additional documents.'
                  : 'Run ID verification to proceed.',
              identityBannerStatus === 'complete' ? <FaCheckCircle size={12} /> : identityBannerStatus === 'review' ? <FaExclamationTriangle size={12} /> : <FaIdCard size={12} />,
              // Inline action button based on status
              eidStatus === 'pending' && onTriggerEID ? (
                <button
                  type="button"
                  disabled={isTriggerEidLoading}
                  onClick={(e) => { e.stopPropagation(); openTriggerEidConfirm(); }}
                  style={{
                    padding: '6px 12px',
                    background: colours.highlight,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: isTriggerEidLoading ? 'default' : 'pointer',
                    opacity: isTriggerEidLoading ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <FaIdCard size={10} />
                  {isTriggerEidLoading ? 'Starting…' : 'Run Verification'}
                </button>
              ) : undefined,
            )}

            {(() => {
              const instructedRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || submissionDateRaw || null;
              const identityTimelineRaw = eidTileDetails?.overall?.checkedAt || verificationDetails?.checkedDate || eid?.EIDCheckedDate || null;

              const parseDate = (raw: any): Date | null => {
                if (!raw) return null;
                const d = new Date(raw);
                return Number.isNaN(d.getTime()) ? null : d;
              };

              const formatStamp = (raw: any): string | null => {
                const d = parseDate(raw);
                if (!d) return null;
                const rawText = typeof raw === 'string' ? raw : '';
                const hasTime = /T\d{2}:\d{2}/.test(rawText) || /\d{2}:\d{2}/.test(rawText);
                const date = formatRelativeDay(d);
                if (!hasTime) return date;
                const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${date} ${time}`;
              };

              const formatDiff = (fromRaw: any, toRaw: any): string | null => {
                const from = parseDate(fromRaw);
                const to = parseDate(toRaw);
                if (!from || !to) return null;
                const diffMs = Math.abs(to.getTime() - from.getTime());
                const mins = Math.floor(diffMs / 60000);
                if (mins < 60) return `${mins}m`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) {
                  const remMins = mins % 60;
                  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                }
                const days = Math.floor(hrs / 24);
                const remHrs = hrs % 24;
                return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
              };

              const instructedStamp = formatStamp(instructedRaw);
              const identityStamp = formatStamp(identityTimelineRaw);
              const elapsed = formatDiff(instructedRaw, identityTimelineRaw);
              const showTimeline = Boolean(instructedStamp || identityStamp);

              if (!showTimeline) return null;

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: flatEmbedMode ? '8px 10px' : '8px 14px', minHeight: 36,
                  background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(244, 244, 246, 0.35)',
                  border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
                  borderRadius: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {instructedStamp && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
                        flexShrink: 0,
                      }}>
                        <FaClock size={10} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          Instructed
                          <span style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.85)' : 'rgba(107, 107, 107, 0.9)', fontWeight: 500 }}> · {instructedStamp}</span>
                        </span>
                      </div>
                    )}

                    {(instructedStamp && identityStamp) && (
                      <div style={{
                        display: 'flex', alignItems: 'center', width: elapsed ? 'auto' : 60,
                        margin: '0 2px',
                      }}>
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                        {elapsed && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: isDarkMode ? 700 : 600,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            opacity: isDarkMode ? 1 : 0.72,
                            padding: '1px 5px', whiteSpace: 'nowrap',
                          }}>
                            {elapsed}
                          </span>
                        )}
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                      </div>
                    )}

                    {identityStamp && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: identityBannerStatus === 'complete'
                          ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                          : identityBannerStatus === 'review'
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                            : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'),
                        border: `1px solid ${identityBannerStatus === 'complete'
                          ? (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)')
                          : identityBannerStatus === 'review'
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.16)')
                            : (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.16)')}`,
                        flexShrink: 0,
                      }}>
                        {identityBannerStatus === 'complete'
                          ? <FaCheckCircle size={10} style={{ color: colours.green }} />
                          : identityBannerStatus === 'review'
                            ? <FaExclamationTriangle size={10} style={{ color: colours.cta }} />
                            : <FaIdCard size={10} style={{ color: colours.highlight }} />}
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: identityBannerStatus === 'complete' ? colours.green : identityBannerStatus === 'review' ? colours.cta : colours.highlight,
                        }}>
                          {identityBannerStatus === 'complete' ? 'Verified' : identityBannerStatus === 'review' ? 'Review' : 'Pending'}
                          <span style={{ color: identityBannerStatus === 'complete' ? (isDarkMode ? 'rgba(32, 178, 108, 0.8)' : 'rgba(32, 178, 108, 0.9)') : identityBannerStatus === 'review' ? (isDarkMode ? 'rgba(214, 85, 65, 0.82)' : 'rgba(214, 85, 65, 0.9)') : (isDarkMode ? 'rgba(54, 144, 206, 0.82)' : 'rgba(54, 144, 206, 0.9)'), fontWeight: 500 }}> · {identityStamp}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ID Verification Section */}
            <div style={{
              padding: flatEmbedMode ? '0' : '12px 14px',
              background: flatEmbedMode ? 'transparent' : (isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(244, 244, 246, 0.35)'),
              border: flatEmbedMode ? 'none' : `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
              borderRadius: 0
            }}>
              {/* Header */}
              {eidStatus === 'pending' && (
                <div style={{ fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? colours.accent : colours.highlight }}>
                  <FaIdCard size={10} style={{ opacity: 0.8 }} />
                  ID Readiness
                </div>
              )}

              {/* Data bar - Check metadata (only when verification has run) */}
              {eidStatus !== 'pending' && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0,
                  padding: '10px 0',
                  background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                  borderRadius: 0,
                  border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
                  marginBottom: 12
                }}>
                  {/* Checked Date */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Checked</span>
                    <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      {eidTileDetails?.overall?.checkedAt || formatMaybeDate(verificationDetails?.checkedDate) || verificationDetails?.checkedDate || eidDate || '—'}
                    </span>
                  </div>
                  
                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral, margin: '4px 0' }} />
                  
                  {/* Document Type */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      Document
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: (passport !== '—' || license !== '—') ? (isDarkMode ? '#d1d5db' : '#374151') : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                      {passport !== '—' ? 'Passport' : license !== '—' ? 'Driving License' : '—'}
                    </span>
                  </div>
                  
                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral, margin: '4px 0' }} />
                  
                  {/* Provider */}
                  {(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Provider</span>
                      <span
                        style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#d1d5db' : '#374151', cursor: verificationMeta.provider !== '—' ? 'pointer' : 'default' }}
                        onClick={(e) => { if (verificationMeta.provider === '—') return; e.stopPropagation(); void safeCopy(verificationMeta.provider); }}
                        title={verificationMeta.provider !== '—' ? 'Click to copy' : undefined}
                      >
                        {verificationMeta.provider || '—'}
                      </span>
                    </div>
                  )}
                  
                  {/* Ref */}
                  {!isCompactIdentityView && verificationMeta.correlationId !== '—' && (
                    <>
                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral, margin: '4px 0' }} />
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Ref</span>
                        <span
                          style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? '#d1d5db' : '#374151', cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onClick={(e) => { e.stopPropagation(); void safeCopy(verificationMeta.correlationId); }}
                          title={`${verificationMeta.correlationId}\n\nClick to copy`}
                        >
                          {verificationMeta.correlationId}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Verification Data - Collapsible section with data used in checks */}
              {eidStatus !== 'pending' && (dob !== '—' || nationalityAlpha !== '—' || firstName || lastName) && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    onClick={() => setIsVerificationDataExpanded(!isVerificationDataExpanded)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(244, 244, 246, 0.25)',
                      border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
                      borderRadius: 0,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        lineHeight: 1
                      }}>
                        Verification Data
                      </div>
                      {!isVerificationDataExpanded && !isCompactIdentityView && (
                        <div style={{
                          fontSize: 10,
                          color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.55)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 280
                        }}>
                          {[firstName, lastName].filter(Boolean).join(' ')} • {dob} • {nationalityAlpha}
                        </div>
                      )}
                    </div>
                    <FaChevronDown
                      size={10}
                      style={{
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        transform: isVerificationDataExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  </div>

                  {isVerificationDataExpanded && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0,
                      padding: '10px 0',
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
                      marginTop: 8
                    }}>
                      {/* Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Name</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>
                          {[title, firstName, lastName].filter(Boolean).join(' ') || '—'}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? colours.dark.border : '#e1e1e1', margin: '4px 0' }} />

                      {/* Document Number */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          {passport !== '—' ? 'Passport' : license !== '—' ? 'License' : 'Doc No.'}
                        </span>
                        <span 
                          onClick={(passport !== '—' || license !== '—') ? (e) => { e.stopPropagation(); void safeCopy(passport !== '—' ? passport : license); } : undefined}
                          title={(passport !== '—' || license !== '—') ? 'Click to copy' : undefined}
                          style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: (passport !== '—' || license !== '—') ? (isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733') : (isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0'), cursor: (passport !== '—' || license !== '—') ? 'pointer' : 'default' }}>
                          {(passport !== '—' ? passport : license !== '—' ? license : '—')}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? colours.dark.border : '#e1e1e1', margin: '4px 0' }} />

                      {/* DOB */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>DOB</span>
                        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: dob !== '—' ? (isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733') : (isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0') }}>
                          {dob}{age !== '—' ? ` (${age})` : ''}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? colours.dark.border : '#e1e1e1', margin: '4px 0' }} />

                      {/* Nationality */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Nationality</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: nationalityAlpha !== '—' ? (isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733') : (isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0') }}>
                          {nationalityAlpha}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? colours.dark.border : '#e1e1e1', margin: '4px 0' }} />

                      {/* Address (if available) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px', flex: 1, minWidth: 200 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Address</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: address ? (isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733') : (isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {address || '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Document Provided sub-section - REMOVED (Redundant with Data Bar) */}

                {/* EID Results - only show when verification has been run */}
                {eidStatus !== 'pending' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* ── Result Indicator Pills ── */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                  padding: '8px 0',
                }}>
                  {/* Overall Pill */}
                  {(() => {
                    const overallValue = isManuallyApproved
                      ? 'Approved'
                      : (rawCheckResultSnapshot.overall !== '—'
                        ? rawCheckResultSnapshot.overall
                        : (eidResult && eidResult !== '—' ? eidResult : (verificationDetails?.overallResult || '—')));
                    const isPass = overallValue.toLowerCase().includes('pass') || overallValue.toLowerCase().includes('clear') || overallValue.toLowerCase() === 'approved';
                    const isWarn = overallValue.toLowerCase().includes('review') || overallValue.toLowerCase().includes('refer');
                    const isFail = overallValue.toLowerCase().includes('fail');
                    const isOverallNeedsAction = isFail || isWarn;
                    const pillBg = isPass
                      ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                      : (isFail || isWarn)
                        ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                        : (isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.06)');
                    const pillBorder = isPass
                      ? (isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)')
                      : (isFail || isWarn)
                        ? (isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)')
                        : (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)');
                    const pillColor = isPass ? colours.green : (isFail || isWarn) ? colours.cta : colours.highlight;
                    return (
                      <div
                        title={'Overall result'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '4px 10px',
                          background: pillBg,
                          border: `1px solid ${pillBorder}`,
                          borderRadius: 999,
                        }}
                      >
                        {isPass ? <FaCheckCircle size={10} color={pillColor} /> : (isFail || isWarn) ? <FaExclamationTriangle size={10} color={pillColor} /> : <FaShieldAlt size={10} color={pillColor} />}
                        <span style={{ fontSize: 10, fontWeight: 700, color: pillColor }}>{overallValue}</span>
                      </div>
                    );
                  })()}

                  {/* PEP/Sanctions Pill */}
                  {(() => {
                    const pepValue = rawCheckResultSnapshot.pep !== '—'
                      ? rawCheckResultSnapshot.pep
                      : normaliseVerificationFieldValue(pepResult && pepResult !== '—' ? pepResult : verificationDetails?.pepResult);
                    const isPass = pepValue.toLowerCase().includes('pass') || pepValue.toLowerCase().includes('clear') || pepValue.toLowerCase().includes('no match');
                    const isWarn = pepValue.toLowerCase().includes('review') || pepValue.toLowerCase().includes('refer');
                    const isFail = pepValue.toLowerCase().includes('fail') || pepValue.toLowerCase().includes('match');
                    const pillColor = isPass ? colours.highlight : (isFail || isWarn) ? colours.cta : (isDarkMode ? '#d1d5db' : '#374151');
                    return (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px',
                        background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                        borderRadius: 999,
                      }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.3px' }}>PEP</span>
                        {isPass ? <FaCheckCircle size={9} color={pillColor} /> : (isFail || isWarn) ? <FaExclamationTriangle size={9} color={pillColor} /> : null}
                        <span style={{ fontSize: 10, fontWeight: 600, color: pillColor }}>{pepValue}</span>
                      </div>
                    );
                  })()}

                  {/* Address Pill */}
                  {(() => {
                    const addrValue = rawCheckResultSnapshot.address !== '—'
                      ? rawCheckResultSnapshot.address
                      : normaliseVerificationFieldValue(addressVerification && addressVerification !== '—' ? addressVerification : verificationDetails?.addressResult);
                    const isPass = addrValue.toLowerCase().includes('pass') || addrValue.toLowerCase().includes('verified');
                    const isWarn = addrValue.toLowerCase().includes('review') || addrValue.toLowerCase().includes('refer');
                    const isFail = addrValue.toLowerCase().includes('fail');
                    const pillColor = isPass ? colours.highlight : (isFail || isWarn) ? colours.cta : (isDarkMode ? '#d1d5db' : '#374151');
                    return (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px',
                        background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                        borderRadius: 999,
                      }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Addr</span>
                        {isPass ? <FaCheckCircle size={9} color={pillColor} /> : (isFail || isWarn) ? <FaExclamationTriangle size={9} color={pillColor} /> : null}
                        <span style={{ fontSize: 10, fontWeight: 600, color: pillColor }}>{addrValue}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Inline Review Actions (shown when EID needs review/fail) ── */}
                {(() => {
                  const overallVal = isManuallyApproved
                    ? 'Approved'
                    : (rawCheckResultSnapshot.overall !== '—'
                      ? rawCheckResultSnapshot.overall
                      : (eidResult && eidResult !== '—' ? eidResult : (verificationDetails?.overallResult || '')));
                  const needsAction = !isManuallyApproved && (overallVal.toLowerCase().includes('review') || overallVal.toLowerCase().includes('refer') || overallVal.toLowerCase().includes('fail'));
                  if (!needsAction) return null;
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.04)',
                      border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.18)' : 'rgba(214, 85, 65, 0.12)'}`,
                      borderRadius: 0,
                    }}>
                      {/* Warning icon + message */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <FaExclamationTriangle size={11} color={colours.cta} />
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.4, color: isDarkMode ? '#d1d5db' : '#374151', minWidth: 0 }}>
                          ID check flagged issues. Approve if acceptable, or request documents.
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setShowApproveModal(true)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px',
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.06)',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                            borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <FaCheck size={10} color={colours.highlight} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: colours.highlight }}>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRequestDocsModal(true)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px',
                            background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)',
                            border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.15)'}`,
                            borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <FaFileAlt size={10} color={colours.cta} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: colours.cta }}>Request Docs</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Document Controls Bar ── */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 0',
                  borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                }}>
                  {/* View Report toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!showEidReportPanel) {
                        buildRawRecordPdfBlobUrl();
                        setIsRawRecordExpanded(false);
                      }
                      setShowEidReportPanel((v) => !v);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px',
                      background: showEidReportPanel
                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
                        : 'transparent',
                      color: showEidReportPanel ? colours.highlight : (isDarkMode ? '#d1d5db' : '#374151'),
                      border: `1px solid ${showEidReportPanel
                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)')
                        : (isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)')}`,
                      borderRadius: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <FaFilePdf size={10} />
                    {showEidReportPanel ? 'Hide Report' : 'View Report'}
                  </button>

                  {/* Download */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); downloadRawRecordPdf(); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px',
                      background: 'transparent',
                      color: isDarkMode ? '#d1d5db' : '#374151',
                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                      borderRadius: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <FaDownload size={9} />
                    Download
                  </button>

                  {/* Save to Docs / Saved indicator */}
                  {existingEidPdfDoc ? (
                    <div
                      title={`Saved: ${existingEidPdfDoc.FileName}\nUploaded: ${existingEidPdfDoc.UploadedAt ? new Date(existingEidPdfDoc.UploadedAt).toLocaleString('en-GB') : '—'}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 8px',
                        background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                        border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.12)'}`,
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 600,
                        color: colours.green,
                      }}
                    >
                      <FaCheckCircle size={8} />
                      Saved to Docs
                    </div>
                  ) : !isDemoInstruction ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); persistRawRecordPdf(); }}
                      disabled={isPersistingRawRecordPdf}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px',
                        background: 'transparent',
                        color: isDarkMode ? '#d1d5db' : '#374151',
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                        borderRadius: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: isPersistingRawRecordPdf ? 'wait' : 'pointer',
                        opacity: isPersistingRawRecordPdf ? 0.5 : 1,
                      }}
                    >
                      <FaCloudUploadAlt size={10} />
                      {isPersistingRawRecordPdf ? 'Saving…' : 'Save report'}
                    </button>
                  ) : null}

                  {isDemoInstruction && (
                    <div
                      title={rawRecordSubmittedAt ? `Submitted: ${new Date(rawRecordSubmittedAt).toLocaleString('en-GB')}` : rawRecordSubmitMessage}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 8px',
                        background: rawRecordSubmitState === 'submitting'
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                          : rawRecordSubmitState === 'failed'
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                            : rawRecordSubmitState === 'submitted'
                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                              : (isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.04)'),
                        border: `1px solid ${rawRecordSubmitState === 'failed'
                          ? (isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)')
                          : rawRecordSubmitState === 'submitted'
                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)')
                            : (isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.08)')}`,
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 700,
                        color: rawRecordSubmitState === 'submitting'
                          ? colours.highlight
                          : rawRecordSubmitState === 'failed'
                            ? colours.cta
                            : rawRecordSubmitState === 'submitted'
                              ? colours.green
                              : (isDarkMode ? colours.subtleGrey : colours.greyText),
                      }}
                    >
                      {rawRecordSubmitState === 'submitting'
                        ? 'Auto-submit: Saving…'
                        : rawRecordSubmitState === 'failed'
                          ? 'Auto-submit: Failed'
                          : rawRecordSubmitState === 'submitted'
                            ? 'Auto-submitted'
                            : 'Auto-submit enabled'}
                    </div>
                  )}

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Raw Data toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRawRecordExpanded) setShowEidReportPanel(false);
                      setIsRawRecordExpanded((v) => !v);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px',
                      background: isRawRecordExpanded
                        ? (isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.04)')
                        : 'transparent',
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                      borderRadius: 0,
                      fontSize: 9,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FaCode size={8} />
                    {isRawRecordExpanded ? 'Hide JSON' : 'Raw JSON'}
                  </button>

                  {/* Expand to full-screen (only when report panel is open) */}
                  {showEidReportPanel && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRawRecordPdfPreview();
                      }}
                      title="Expand to full screen"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '4px 6px',
                        background: 'transparent',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                        borderRadius: 0,
                        fontSize: 9,
                        cursor: 'pointer',
                      }}
                    >
                      <FaExpand size={9} />
                    </button>
                  )}
                </div>

                {/* ── Inline Verification Report Panel ── */}
                {showEidReportPanel && rawRecordPdfUrl && (
                  <div style={{
                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)'}`,
                    borderRadius: 0,
                    overflow: 'hidden',
                    background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                    transition: 'all 0.2s ease',
                  }}>
                    {/* Thin accent header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '5px 10px',
                      background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                      borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)'}`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colours.highlight, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FaFilePdf size={10} />
                        Identity Verification Report
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowEidReportPanel(false); }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20,
                          background: 'transparent',
                          border: 'none',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <FaTimes size={10} />
                      </button>
                    </div>
                    {/* PDF object — <object> with data URI renders inline; blob: URLs trigger download */}
                    {rawRecordPdfUrl?.startsWith('data:') ? (
                      <object
                        data={rawRecordPdfUrl}
                        type="application/pdf"
                        title="Identity Verification Report"
                        style={{
                          border: 'none', width: '100%',
                          height: isCompactIdentityView ? 340 : 420,
                          background: isDarkMode ? '#1a1a2e' : '#f5f5f5',
                        }}
                      >
                        <p style={{ padding: 20, fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                          PDF preview not available in this browser. <a href={rawRecordPdfUrl} download="eid-report.pdf" style={{ color: colours.highlight }}>Download instead</a>.
                        </p>
                      </object>
                    ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: isCompactIdentityView ? 340 : 420,
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        fontSize: 11,
                        gap: 6,
                      }}>
                        <div className="helix-spin" style={{ width: 14, height: 14, border: `2px solid ${colours.highlight}`, borderTopColor: 'transparent', borderRadius: '50%' }} />
                        Generating report…
                      </div>
                    )}
                  </div>
                )}

                {/* ── Raw JSON (secondary, collapsible) ── */}
                {isRawRecordExpanded && (
                  <div style={{
                    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                    borderRadius: 0,
                    overflow: 'hidden',
                  }}>
                    <pre style={{
                      margin: 0,
                      padding: '8px 10px',
                      fontSize: 10,
                      lineHeight: 1.45,
                      fontFamily: 'monospace',
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.82)' : 'rgba(6, 23, 51, 0.72)',
                      background: isDarkMode ? 'rgba(6, 23, 51, 0.55)' : 'rgba(255, 255, 255, 0.75)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 240,
                      overflow: 'auto',
                    }}>
                      {getRawRecordText()}
                    </pre>
                  </div>
                )}

                {/* Full-screen PDF modal (expanded view) */}
                {showRawRecordPdfPreview && rawRecordPdfUrl && createPortal(
                  <div
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0, 3, 25, 0.6)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                    }}
                    onClick={() => setShowRawRecordPdfPreview(false)}
                  >
                    <div
                      style={{
                        width: '92%',
                        maxWidth: 920,
                        height: '86vh',
                        background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                        borderRadius: 0,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FaFilePdf size={12} color={colours.highlight} />
                          Identity Verification Report
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => { downloadRawRecordPdf(); }}
                            title="Download PDF to your device"
                            style={{
                              padding: '6px 10px',
                              background: 'transparent',
                              color: isDarkMode ? colours.dark.text : colours.light.text,
                              border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                              borderRadius: 0,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                            }}
                          >
                            <FaDownload size={10} />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRawRecordPdfPreview(false)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              padding: '6px 8px',
                              background: 'transparent',
                              color: isDarkMode ? colours.subtleGrey : colours.greyText,
                              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                              borderRadius: 0,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <FaTimes size={11} />
                          </button>
                        </div>
                      </div>
                      {rawRecordPdfUrl?.startsWith('data:') ? (
                        <object
                          data={rawRecordPdfUrl}
                          type="application/pdf"
                          title="Identity Verification Report"
                          style={{ border: 'none', width: '100%', height: '100%' }}
                        >
                          <p style={{ padding: 20, fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            PDF preview not available. <a href={rawRecordPdfUrl} download="eid-report.pdf" style={{ color: colours.highlight }}>Download instead</a>.
                          </p>
                        </object>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: isDarkMode ? colours.subtleGrey : colours.greyText, fontSize: 12, gap: 8 }}>
                          <div className="helix-spin" style={{ width: 16, height: 16, border: `2px solid ${colours.highlight}`, borderTopColor: 'transparent', borderRadius: '50%' }} />
                          Generating report…
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}

                {/* Expanded details - additional refs */}
                {isEidDetailsExpanded && (
                  <div style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    {isVerificationDetailsLoading && (
                      <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(243, 244, 246, 0.75)' : 'rgba(6, 23, 51, 0.65)' }}>
                        Loading verification details—
                      </div>
                    )}

                    {!isVerificationDetailsLoading && verificationDetailsError && (
                      <div style={{ fontSize: 10, color: '#D65541', fontWeight: 600 }}>{verificationDetailsError}</div>
                    )}

                    {!isVerificationDetailsLoading && !verificationDetailsError && !verificationDetails && (
                      <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(243, 244, 246, 0.75)' : 'rgba(6, 23, 51, 0.65)' }}>
                        No verification details available.
                      </div>
                    )}

                    {verificationDetails && (
                      <>
                    {/* Additional reference IDs */}
                    {verificationMeta.references.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(160, 160, 160, 0.45)' : 'rgba(107, 107, 107, 0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Additional References
                        </div>
                        {verificationMeta.references.slice(0, 3).map((ref) => (
                          <div key={ref.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 6, alignItems: 'baseline' }}>
                            <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(160, 160, 160, 0.4)' : 'rgba(107, 107, 107, 0.4)', textAlign: 'left' }}>{ref.label}</div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.8)',
                                cursor: 'pointer',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              onClick={(e) => { e.stopPropagation(); void safeCopy(ref.value); }}
                              title="Click to copy"
                            >
                              {ref.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}



                    {/* Approve Verification Modal — portalled to body */}
                    {showApproveModal && createPortal(
                      <div
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0, 0, 0, 0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 9999,
                        }}
                        onClick={() => setShowApproveModal(false)}
                      >
                        <div
                          style={{
                            background: isDarkMode ? '#061733' : '#ffffff',
                            borderRadius: 0,
                            padding: 20,
                            maxWidth: 420,
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(54, 144, 206, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FaCheck size={16} color={colours.highlight} />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#e1e1e1' : '#0f172a' }}>Approve ID Verification</div>
                              <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{verificationDetails?.instructionRef || instructionRef}</div>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, lineHeight: 1.5, color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : 'rgba(6, 23, 51, 0.8)', marginBottom: 16 }}>
                            <p style={{ margin: '0 0 10px 0' }}>By approving, you confirm that:</p>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <li>The EID check results are satisfactory</li>
                              <li>The client's identity has been verified</li>
                              <li>No further documents are required</li>
                            </ul>
                          </div>

                          <div style={{
                            padding: 10,
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                            borderRadius: 0,
                            fontSize: 11,
                            color: isDarkMode ? 'rgba(243, 244, 246, 0.75)' : 'rgba(6, 23, 51, 0.7)',
                            marginBottom: 16,
                          }}>
                            <strong>What happens next:</strong> The ID status will be marked as verified and the instruction will move to <strong>proof-of-id-complete</strong>. No emails are sent automatically from this action.
                          </div>

                          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => setShowApproveModal(false)}
                              style={{
                                padding: '8px 14px',
                                background: 'transparent',
                                color: isDarkMode ? 'rgba(160, 160, 160, 0.8)' : 'rgba(107, 107, 107, 0.8)',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                                borderRadius: 0,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isVerificationActionLoading}
                              onClick={async () => {
                                if (!verificationDetails?.instructionRef) return;
                                setIsVerificationActionLoading(true);
                                try {
                                  await approveVerification(verificationDetails.instructionRef);
                                  await loadVerificationDetails();
                                  setShowApproveModal(false);
                                  showToast({ type: 'success', title: 'ID Approved', message: 'Verification manually approved' });
                                  if (onRefreshData) { try { await onRefreshData(instructionRef); } catch { /* silent */ } }
                                } finally {
                                  setIsVerificationActionLoading(false);
                                }
                              }}
                              style={{
                                padding: '8px 14px',
                                background: colours.highlight,
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 0,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isVerificationActionLoading ? 'default' : 'pointer',
                                opacity: isVerificationActionLoading ? 0.7 : 1,
                              }}
                            >
                              {isVerificationActionLoading ? 'Approving—' : 'Approve Verification'}
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}

                    {/* Request Documents Modal — portalled to body */}
                    {showRequestDocsModal && createPortal(
                      <div
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0, 0, 0, 0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 9999,
                        }}
                        onClick={() => setShowRequestDocsModal(false)}
                      >
                        <div
                          style={{
                            background: isDarkMode ? '#061733' : '#ffffff',
                            borderRadius: 0,
                            padding: 20,
                            maxWidth: 520,
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FaFileAlt size={14} color="#D65541" />
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? '#e1e1e1' : '#0f172a' }}>Request ID Documents</div>
                              <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{verificationDetails?.instructionRef || instructionRef}</div>
                            </div>
                          </div>

                          {/* Recipient Override Section */}
                          <div style={{
                            background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(248, 250, 252, 1)',
                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                            borderRadius: 0,
                            padding: 14,
                            marginBottom: 14,
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                              Recipients
                            </div>

                            {/* To */}
                            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start', marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(160, 160, 160, 0.75)' : 'rgba(107, 107, 107, 0.75)', paddingTop: 6 }}>To</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {!useManualToRecipient ? (
                                  <select
                                    value={emailOverrideTo || ''}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      if (next === '__manual__') {
                                        setUseManualToRecipient(true);
                                        return;
                                      }
                                      setUseManualToRecipient(false);
                                      setEmailOverrideTo(next);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '7px 10px',
                                      fontSize: 11,
                                      borderRadius: 0,
                                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                      background: isDarkMode ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                                      color: isDarkMode ? '#e1e1e1' : '#0f172a',
                                      outline: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <option value="">Default fee earner{feeEarnerEmail ? ` (${feeEarnerEmail})` : ''}</option>
                                    {colleagueEmailOptions.map((opt) => (
                                      <option key={opt.email} value={opt.email}>
                                        {opt.label}
                                      </option>
                                    ))}
                                    <option value="__manual__">Enter email manually…</option>
                                  </select>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input
                                      type="email"
                                      value={emailOverrideTo}
                                      onChange={(e) => setEmailOverrideTo(e.target.value)}
                                      placeholder="Enter recipient email address"
                                      style={{
                                        width: '100%',
                                        padding: '7px 10px',
                                        fontSize: 11,
                                        fontFamily: 'inherit',
                                        background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                        borderRadius: 0,
                                        color: isDarkMode ? '#e1e1e1' : '#0f172a',
                                        outline: 'none',
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setUseManualToRecipient(false);
                                        if (!emailOverrideTo) {
                                          setEmailOverrideTo('');
                                        }
                                      }}
                                      style={{
                                        padding: '6px 10px',
                                        background: 'transparent',
                                        color: isDarkMode ? 'rgba(160, 160, 160, 0.8)' : 'rgba(107, 107, 107, 0.8)',
                                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(107, 107, 107, 0.18)'}`,
                                        borderRadius: 0,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        width: 'fit-content',
                                      }}
                                    >
                                      Pick colleague instead
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* CC */}
                            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(160, 160, 160, 0.75)' : 'rgba(107, 107, 107, 0.75)', paddingTop: 6 }}>CC</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {colleagueEmailOptions.length > 0 && (
                                  <select
                                    onChange={(e) => {
                                      const selectedEmail = e.target.value;
                                      if (!selectedEmail) return;
                                      const ccList = emailOverrideCc ? emailOverrideCc.split(',').map((x) => x.trim()) : [];
                                      if (!ccList.some((addr) => addr.toLowerCase() === selectedEmail.toLowerCase())) {
                                        ccList.push(selectedEmail);
                                        setEmailOverrideCc(ccList.filter(Boolean).join(', '));
                                      }
                                      e.target.value = '';
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '7px 10px',
                                      fontSize: 11,
                                      borderRadius: 0,
                                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                      background: isDarkMode ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                                      color: isDarkMode ? '#e1e1e1' : '#0f172a',
                                      outline: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <option value="">+ Add colleague to CC</option>
                                    {colleagueEmailOptions.map((opt) => (
                                      <option key={opt.email} value={opt.email}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {(useManualCcRecipients || Boolean(emailOverrideCc)) ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input
                                      type="text"
                                      value={emailOverrideCc}
                                      onChange={(e) => setEmailOverrideCc(e.target.value)}
                                      placeholder="CC email addresses (comma separated)"
                                      style={{
                                        width: '100%',
                                        padding: '7px 10px',
                                        fontSize: 11,
                                        fontFamily: 'inherit',
                                        background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                        borderRadius: 0,
                                        color: isDarkMode ? '#e1e1e1' : '#0f172a',
                                        outline: 'none',
                                      }}
                                    />
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEmailOverrideCc('');
                                          setUseManualCcRecipients(false);
                                        }}
                                        style={{
                                          padding: '5px 8px',
                                          background: 'transparent',
                                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                          border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(107, 107, 107, 0.18)'}`,
                                          borderRadius: 0,
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Clear CC
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setUseManualCcRecipients(true)}
                                    style={{
                                      padding: 0,
                                      background: 'transparent',
                                      border: 'none',
                                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      width: 'fit-content',
                                    }}
                                  >
                                    Enter CC manually
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Email Preview - matches server template */}
                          <div style={{
                            background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(248, 250, 252, 1)',
                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                            borderRadius: 0,
                            padding: 12,
                            marginBottom: 12,
                            maxHeight: 200,
                            overflowY: 'auto',
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                              Email preview
                            </div>
                            <div style={{
                              fontSize: 10,
                              lineHeight: 1.6,
                              color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.75)',
                              padding: 10,
                              background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : '#ffffff',
                              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                              borderRadius: 0,
                              fontFamily: 'inherit',
                            }}>
                              Dear {fullName !== 'Unknown' ? fullName.split(' ')[0] : 'Client'},<br /><br />
                              Thank you for submitting your proof of identity form. We initially aim to verify identities electronically.<br /><br />
                              Unfortunately, we were unable to verify your identity through electronic means. Please be assured that this is a common occurrence and can result from various factors, such as recent relocation or a limited history at your current residence.<br /><br />
                              To comply with anti-money laundering regulations and our know-your-client requirements, we kindly ask you to provide additional documents.<br /><br />
                              <strong>Please provide 1 item from Section A and 1 item from Section B:</strong><br /><br />
                              <strong>Section A (ID)</strong><br />
                              • Passport (current and valid)<br />
                              • Driving Licence<br />
                              • Employer Identity Card<br />
                              • Other item showing name, signature and address<br /><br />
                              <strong>Section B (Address)</strong><br />
                              • Recent utility bill (not more than 3 months old)<br />
                              • Recent Council Tax Bill<br />
                              • Mortgage Statement (not more than 3 months old)<br />
                              • Bank or Credit Card Statement (not more than 3 months old)<br /><br />
                              Please reply to this email with the requested documents attached as clear photographs or scanned copies.<br /><br />
                              Best regards,<br />
                              {feeEarner !== '—' ? feeEarner.split(' ')[0] : '[Fee Earner]'}
                            </div>
                          </div>

                          {/* Confirmation Summary Box */}
                          <div style={{
                            padding: 12,
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)',
                            border: `1.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                            borderRadius: 0,
                            marginBottom: 14,
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: colours.highlight, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                              Summary
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, minWidth: 50 }}>Send to</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#e1e1e1' : '#0f172a' }}>
                                  {emailOverrideTo || feeEarnerEmail || '(no recipient)'}
                                </span>
                              </div>
                              {emailOverrideCc && (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, minWidth: 50 }}>CC</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.75)' }}>
                                    {emailOverrideCc}
                                  </span>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, minWidth: 50 }}>Subject</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.75)' }}>
                                  ID Documents Required — {verificationDetails?.instructionRef || instructionRef}
                                </span>
                              </div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, lineHeight: 1.4 }}>
                              This creates a <strong>draft only</strong> — the recipient can review, edit, and choose when to send it to the client.
                            </div>
                          </div>



                          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setShowRequestDocsModal(false);
                                setEmailOverrideTo('');
                                setEmailOverrideCc('');
                              }}
                              style={{
                                padding: '8px 14px',
                                background: 'transparent',
                                color: isDarkMode ? 'rgba(160, 160, 160, 0.8)' : 'rgba(107, 107, 107, 0.8)',
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                                borderRadius: 0,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isVerificationActionLoading || (!emailOverrideTo && !feeEarnerEmail)}
                              onClick={async () => {
                                if (!verificationDetails?.instructionRef) return;
                                const toEmail = emailOverrideTo || feeEarnerEmail;
                                if (!toEmail) {
                                  showToast({ type: 'warning', message: 'Please enter a recipient email address.' });
                                  return;
                                }
                                setIsVerificationActionLoading(true);
                                try {
                                  // TODO: Pass toEmail and emailOverrideCc to the API
                                  await draftVerificationDocumentRequest(verificationDetails.instructionRef);
                                  setShowRequestDocsModal(false);
                                  setEmailOverrideTo('');
                                  setEmailOverrideCc('');
                                  const recipient = emailOverrideTo || feeEarner || 'fee earner';
                                  showToast({ type: 'success', message: `Draft email created for ${recipient}.` });
                                } catch (err: unknown) {
                                  const message = err instanceof Error ? err.message : 'Unknown error';
                                  showToast({ type: 'error', message: `Failed to create draft: ${message}` });
                                } finally {
                                  setIsVerificationActionLoading(false);
                                }
                              }}
                              style={{
                                padding: '10px 18px',
                                background: (!emailOverrideTo && !feeEarnerEmail) ? '#A0A0A0' : colours.green,
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 0,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: (isVerificationActionLoading || (!emailOverrideTo && !feeEarnerEmail)) ? 'default' : 'pointer',
                                opacity: isVerificationActionLoading ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {isVerificationActionLoading ? (
                                'Creating draft…'
                              ) : (
                                <>
                                  <FaCheck size={10} />
                                  Create Draft (does not send)
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                      </>
                    )}
                  </div>
                )}
                </div>
                ) : (
                  /* EID not yet run - show readiness + CTA */
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : '#e1e1e1'}` }}>

                    {/* Processing overlay */}
                    {eidProcessingState === 'processing' && (
                      <div style={{
                        padding: '20px 18px',
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                        borderRadius: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 14,
                        marginBottom: 12,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          border: `3px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                          borderTopColor: colours.highlight,
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: colours.highlight, marginBottom: 4 }}>
                            Verification in progress
                          </div>
                          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(243, 244, 246, 0.6)' : 'rgba(6, 23, 51, 0.55)', lineHeight: 1.5 }}>
                            Checking identity, address and PEP/sanctions.<br />
                            Results will appear here automatically.
                          </div>
                        </div>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      </div>
                    )}

                    {/* Readiness + CTA (hidden while processing) */}
                    {eidProcessingState !== 'processing' && (
                      <>
                        {/* Data readiness checklist */}
                        {(() => {
                          const hasName = Boolean(firstName && lastName);
                          const hasDob = dob !== '—';
                          const hasAddr = Boolean(address);
                          const hasIdDoc = hasId;
                          const allReady = hasName && hasDob && hasAddr && hasIdDoc;
                          const checks = [
                            { label: 'Name', ready: hasName, value: hasName ? `${firstName} ${lastName}` : 'Missing' },
                            { label: 'Date of birth', ready: hasDob, value: hasDob ? dob : 'Missing' },
                            { label: 'Address', ready: hasAddr, value: hasAddr ? (displayPostcode || 'Provided') : 'Missing' },
                            { label: 'ID document', ready: hasIdDoc, value: hasIdDoc ? (passport !== '—' ? 'Passport' : 'License') : 'Missing' },
                          ];
                          return (
                            <div style={{
                              padding: isCompactIdentityView ? '10px 12px' : '12px 14px',
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(244, 244, 246, 0.25)',
                              border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : colours.highlightNeutral}`,
                              borderRadius: 0,
                              marginBottom: 10,
                            }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0', marginBottom: 8 }}>
                                Readiness
                              </div>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: isCompactIdentityView ? '1fr' : 'repeat(2, minmax(180px, 1fr))',
                                gap: isCompactIdentityView ? '6px' : '8px 14px',
                              }}>
                                {checks.map(c => (
                                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    <div style={{
                                      width: 14, height: 14, borderRadius: '50%',
                                      background: c.ready
                                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
                                        : (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)'),
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      flexShrink: 0,
                                    }}>
                                      {c.ready
                                        ? <FaCheck size={7} color={colours.highlight} />
                                        : <span style={{ width: 6, height: 1.5, background: '#D65541', borderRadius: 1 }} />}
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 600, minWidth: isCompactIdentityView ? 88 : 96, color: c.ready ? (isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.7)') : (isDarkMode ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.6)') }}>
                                      {c.label}
                                    </span>
                                    <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(160, 160, 160, 0.55)' : 'rgba(107, 107, 107, 0.65)', fontFamily: c.ready ? 'inherit' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {c.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {!allReady && (
                                <div style={{ marginTop: 8, fontSize: 10, color: isDarkMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.55)', lineHeight: 1.4 }}>
                                  Missing data may cause verification to fail. Complete DOB, address, and ID document before running.
                                </div>
                              )}
                              <div style={{ marginTop: 8, fontSize: 10, color: isDarkMode ? 'rgba(243, 244, 246, 0.58)' : 'rgba(6, 23, 51, 0.58)', lineHeight: 1.4 }}>
                                Use <strong>Run Verification</strong> above to start the check.
                              </div>
                            </div>
                          );
                        })()}
                        {!onTriggerEID && (
                          <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            Verification is not available for this record.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
            </div>

            {/* Trigger EID Confirmation Modal - shown before starting verification */}
            {showTriggerEidConfirmModal && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 3, 25, 0.6)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                }}
                onClick={() => setShowTriggerEidConfirmModal(false)}
              >
                <div
                  style={{
                    background: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                    borderRadius: 0,
                    padding: 24,
                    maxWidth: 460,
                    width: '90%',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                    boxShadow: isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 14px rgba(0, 0, 0, 0.14)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: isDarkMode ? `${colours.accent}20` : `${colours.highlight}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaIdCard size={18} color={colours.highlight} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>Run ID Verification</div>
                      <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Confirm action</div>
                    </div>
                  </div>

                  <div style={{
                    padding: 12,
                    background: isDarkMode ? 'rgba(2, 6, 23, 0.24)' : 'rgba(244, 244, 246, 0.36)',
                    border: `1px solid ${isDarkMode ? `${colours.dark.border}55` : colours.highlightNeutral}`,
                    borderRadius: 0,
                    marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, marginBottom: 8 }}>
                      What this does
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      Starts an electronic ID verification and records the outcome to this instruction.
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      <strong>Checks include:</strong>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Identity match (name + date of birth)</li>
                        <li>Address verification</li>
                        <li>PEP / sanctions screening</li>
                      </ul>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      <strong>Client comms:</strong> No client emails are sent from Helix Hub in this flow.
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      You’ll see results appear under EID Results once the check completes.
                    </div>

                    {isDemoInstruction && (
                      <div style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.18)' : 'rgba(160, 160, 160, 0.15)'}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.9)', marginBottom: 8 }}>
                          Demo simulation
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>Overall outcome</div>
                            <select
                              value={demoEidSimConfig.outcome}
                              onChange={(e) => {
                                const next = { ...demoEidSimConfig, outcome: e.target.value as DemoEidOutcome };
                                setDemoEidSimConfig(next);
                                persistDemoEidSimConfig(next);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 0,
                                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                                background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                color: isDarkMode ? 'rgba(243, 244, 246, 0.92)' : 'rgba(6, 23, 51, 0.92)',
                                outline: 'none',
                              }}
                            >
                              <option value="pass">Pass</option>
                              <option value="review">Review</option>
                              <option value="fail">Fail</option>
                              <option value="manual-approved">Manual approved</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>PEP / sanctions</div>
                              <select
                                value={demoEidSimConfig.pepResult}
                                onChange={(e) => {
                                  const next = { ...demoEidSimConfig, pepResult: e.target.value as DemoEidSubResult };
                                  setDemoEidSimConfig(next);
                                  persistDemoEidSimConfig(next);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: 0,
                                  border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                                  background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                  color: isDarkMode ? 'rgba(243, 244, 246, 0.92)' : 'rgba(6, 23, 51, 0.92)',
                                  outline: 'none',
                                }}
                              >
                                <option value="passed">Passed</option>
                                <option value="review">Review</option>
                                <option value="failed">Failed</option>
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>Address</div>
                              <select
                                value={demoEidSimConfig.addressResult}
                                onChange={(e) => {
                                  const next = { ...demoEidSimConfig, addressResult: e.target.value as DemoEidSubResult };
                                  setDemoEidSimConfig(next);
                                  persistDemoEidSimConfig(next);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: 0,
                                  border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.25)'}`,
                                  background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                  color: isDarkMode ? 'rgba(243, 244, 246, 0.92)' : 'rgba(6, 23, 51, 0.92)',
                                  outline: 'none',
                                }}
                              >
                                <option value="passed">Passed</option>
                                <option value="review">Review</option>
                                <option value="failed">Failed</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(new Event('demoEidResetRequested'));
                                setShowTriggerEidConfirmModal(false);
                              }}
                              style={{
                                padding: '7px 10px',
                                background: 'transparent',
                                color: colours.cta,
                                border: `1px solid ${isDarkMode ? `${colours.cta}66` : `${colours.cta}44`}`,
                                borderRadius: 0,
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Clear demo check record
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowTriggerEidConfirmModal(false)}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(107, 107, 107, 0.2)'}`,
                        borderRadius: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isTriggerEidLoading}
                      onClick={() => void handleTriggerEid()}
                      style={{
                        padding: '8px 16px',
                        background: colours.highlight,
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: isTriggerEidLoading ? 'default' : 'pointer',
                        opacity: isTriggerEidLoading ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <FaIdCard size={11} />
                      {isTriggerEidLoading ? 'Starting…' : 'Start Verification'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

          </div>
        )}

        {/* Payment Tab */}
        {activeTab === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              paymentBannerStatus === 'complete'
                ? (hasSuccessfulBankPayment ? 'Payment confirmed' : hasSuccessfulCardPayment ? 'Payment received' : 'Payment received')
                : paymentBannerStatus === 'review'
                  ? 'Payment needs attention'
                  : 'Payment pending',
              paymentBannerStatus,
              paymentBannerStatus === 'complete'
                ? (hasSuccessfulBankPayment
                  ? `Confirmed ${paymentDate !== '—' ? paymentDate : 'payment'}. Please verify transactions with Accounts.`
                  : `£${totalPaid.toLocaleString()} · succeeded`)
                : paymentBannerStatus === 'review'
                  ? 'Retry failed payment or issue a new link.'
                  : 'Send payment link or take payment on account.',
              <FaCreditCard size={12} />,
            )}

            {(() => {
              const instructedRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || submissionDateRaw || null;
              const paymentTimelineRaw = (() => {
                const lastSuccessful = successfulPayments.length > 0 ? successfulPayments[successfulPayments.length - 1] : null;
                return lastSuccessful?.created_at || lastSuccessful?.date || lastSuccessful?.payment_date || paymentDateRaw || null;
              })();

              const parseDate = (raw: any): Date | null => {
                if (!raw) return null;
                const d = new Date(raw);
                return Number.isNaN(d.getTime()) ? null : d;
              };

              const formatStamp = (raw: any): string | null => {
                const d = parseDate(raw);
                if (!d) return null;
                const rawText = typeof raw === 'string' ? raw : '';
                const hasTime = /T\d{2}:\d{2}/.test(rawText) || /\d{2}:\d{2}/.test(rawText);
                const date = formatRelativeDay(d);
                if (!hasTime) return date;
                const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${date} ${time}`;
              };

              const formatDiff = (fromRaw: any, toRaw: any): string | null => {
                const from = parseDate(fromRaw);
                const to = parseDate(toRaw);
                if (!from || !to) return null;
                const diffMs = Math.abs(to.getTime() - from.getTime());
                const mins = Math.floor(diffMs / 60000);
                if (mins < 60) return `${mins}m`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) {
                  const remMins = mins % 60;
                  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                }
                const days = Math.floor(hrs / 24);
                const remHrs = hrs % 24;
                return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
              };

              const instructedStamp = formatStamp(instructedRaw);
              const paymentStamp = formatStamp(paymentTimelineRaw);
              const elapsed = formatDiff(instructedRaw, paymentTimelineRaw);
              const showTimeline = Boolean(instructedStamp || paymentStamp);

              if (!showTimeline) return null;

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: flatEmbedMode ? '0 0 2px' : '0 14px 2px', minHeight: 36,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {instructedStamp && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
                        flexShrink: 0,
                      }}>
                        <FaClock size={10} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          Instructed
                          <span style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.85)' : 'rgba(107, 107, 107, 0.9)', fontWeight: 500 }}> · {instructedStamp}</span>
                        </span>
                      </div>
                    )}

                    {(instructedStamp && paymentStamp) && (
                      <div style={{
                        display: 'flex', alignItems: 'center', width: elapsed ? 'auto' : 60,
                        margin: '0 2px',
                      }}>
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                        {elapsed && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: isDarkMode ? 700 : 600,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            opacity: isDarkMode ? 1 : 0.72,
                            padding: '1px 5px', whiteSpace: 'nowrap',
                          }}>
                            {elapsed}
                          </span>
                        )}
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                      </div>
                    )}

                    {paymentStamp && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: hasSuccessfulPayment
                          ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                          : hasFailedPayment
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                            : (isDarkMode ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 140, 0, 0.08)'),
                        border: `1px solid ${hasSuccessfulPayment
                          ? (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)')
                          : hasFailedPayment
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.16)')
                            : (isDarkMode ? 'rgba(255, 140, 0, 0.25)' : 'rgba(255, 140, 0, 0.16)')}`,
                        flexShrink: 0,
                      }}>
                        {hasSuccessfulPayment ? <FaCheckCircle size={10} style={{ color: colours.green }} /> : hasFailedPayment ? <FaExclamationTriangle size={10} style={{ color: colours.cta }} /> : <FaClock size={10} style={{ color: colours.orange }} />}
                        <span style={{ fontSize: 10, fontWeight: 600, color: hasSuccessfulPayment ? colours.green : hasFailedPayment ? colours.cta : colours.orange }}>
                          {hasSuccessfulBankPayment ? 'Confirmed' : hasSuccessfulCardPayment ? 'Paid' : hasSuccessfulPayment ? 'Paid' : hasFailedPayment ? 'Failed' : 'Pending'}
                          <span style={{ color: hasSuccessfulPayment ? (isDarkMode ? 'rgba(32, 178, 108, 0.8)' : 'rgba(32, 178, 108, 0.9)') : hasFailedPayment ? (isDarkMode ? 'rgba(214, 85, 65, 0.82)' : 'rgba(214, 85, 65, 0.9)') : (isDarkMode ? 'rgba(255, 140, 0, 0.82)' : 'rgba(255, 140, 0, 0.9)'), fontWeight: 500 }}> · {paymentStamp}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <PaymentTabContent 
              payments={payments}
              deal={deal}
              totalPaid={totalPaid}
              instructionRef={instructionRef}
              isDarkMode={isDarkMode}
              expandedPayment={expandedPayment}
              setExpandedPayment={setExpandedPayment}
              onConfirmBankPayment={onConfirmBankPayment}
              onRequestPaymentLink={() => setShowPaymentLinkModal(true)}
            />
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              documentBannerStatus === 'complete' ? 'Docs on file' : 'Docs pending',
              documentBannerStatus,
              documentBannerStatus === 'complete' ? 'Review uploaded files and confirm completeness.' : 'Upload ID, proof of address, or supporting documents.',
              <FaFileAlt size={12} />,
            )}
            <DocumentUploadZone
              instructionRef={instructionRef}
              isDarkMode={isDarkMode}
              documents={documents}
              onDocumentsChanged={fetchDocuments}
              onDocumentPreview={onDocumentPreview}
            />
          </div>
        )}

        {/* Risk Tab */}
        {activeTab === 'risk' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              riskBannerStatus === 'complete' ? 'Risk completed' : riskBannerStatus === 'review' ? 'Risk requires review' : 'Risk pending',
              riskBannerStatus,
              riskBannerStatus === 'complete'
                ? 'Risk assessed and recorded.'
                : riskBannerStatus === 'review'
                  ? 'High risk flagged. Review assessment and approvals.'
                  : 'Complete AML risk assessment before proceeding.',
              <FaShieldAlt size={12} />,
            )}

            {(() => {
              const instructedRaw = inst?.SubmissionDate || inst?.InstructionDate || inst?.DateCreated || inst?.CreatedAt || submissionDateRaw || null;
              const riskTimelineRaw = risk?.ComplianceDate || risk?.UpdatedAt || null;

              const parseDate = (raw: any): Date | null => {
                if (!raw) return null;
                const d = new Date(raw);
                return Number.isNaN(d.getTime()) ? null : d;
              };

              const formatStamp = (raw: any): string | null => {
                const d = parseDate(raw);
                if (!d) return null;
                const rawText = typeof raw === 'string' ? raw : '';
                const hasTime = /T\d{2}:\d{2}/.test(rawText) || /\d{2}:\d{2}/.test(rawText);
                const date = formatRelativeDay(d);
                if (!hasTime) return date;
                const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${date} ${time}`;
              };

              const formatDiff = (fromRaw: any, toRaw: any): string | null => {
                const from = parseDate(fromRaw);
                const to = parseDate(toRaw);
                if (!from || !to) return null;
                const diffMs = Math.abs(to.getTime() - from.getTime());
                const mins = Math.floor(diffMs / 60000);
                if (mins < 60) return `${mins}m`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) {
                  const remMins = mins % 60;
                  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
                }
                const days = Math.floor(hrs / 24);
                const remHrs = hrs % 24;
                return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
              };

              const instructedStamp = formatStamp(instructedRaw);
              const riskStamp = formatStamp(riskTimelineRaw);
              const elapsed = formatDiff(instructedRaw, riskTimelineRaw);
              const showTimeline = Boolean(instructedStamp || riskStamp || riskComplete);

              if (!showTimeline) return null;

              const riskColor = isHighRisk ? colours.cta : isMediumRisk ? colours.orange : colours.green;

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: flatEmbedMode ? '0 0 2px' : '0 14px 2px', minHeight: 36,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {instructedStamp && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
                        flexShrink: 0,
                      }}>
                        <FaClock size={10} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          Instructed
                          <span style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.85)' : 'rgba(107, 107, 107, 0.9)', fontWeight: 500 }}> · {instructedStamp}</span>
                        </span>
                      </div>
                    )}

                    {(instructedStamp && (riskStamp || riskComplete)) && (
                      <div style={{
                        display: 'flex', alignItems: 'center', width: elapsed ? 'auto' : 60,
                        margin: '0 2px',
                      }}>
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                        {elapsed && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: isDarkMode ? 700 : 600,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                            opacity: isDarkMode ? 1 : 0.72,
                            padding: '1px 5px', whiteSpace: 'nowrap',
                          }}>
                            {elapsed}
                          </span>
                        )}
                        <div style={{
                          flex: 1, height: 1, minWidth: 12,
                          background: isDarkMode ? `${colours.dark.border}60` : '#e2e8f0',
                        }} />
                      </div>
                    )}

                    {(riskStamp || riskComplete) && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 0,
                        background: riskComplete
                          ? (isHighRisk
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                            : isMediumRisk
                              ? (isDarkMode ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 140, 0, 0.08)')
                              : (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)'))
                          : (isDarkMode ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 140, 0, 0.08)'),
                        border: `1px solid ${riskComplete
                          ? (isHighRisk
                            ? (isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.16)')
                            : isMediumRisk
                              ? (isDarkMode ? 'rgba(255, 140, 0, 0.25)' : 'rgba(255, 140, 0, 0.16)')
                              : (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)'))
                          : (isDarkMode ? 'rgba(255, 140, 0, 0.25)' : 'rgba(255, 140, 0, 0.16)')}`,
                        flexShrink: 0,
                      }}>
                        {riskComplete ? <FaShieldAlt size={10} style={{ color: riskColor }} /> : <FaClock size={10} style={{ color: colours.orange }} />}
                        <span style={{ fontSize: 10, fontWeight: 600, color: riskComplete ? riskColor : colours.orange }}>
                          {riskComplete ? `${riskResult}${riskScore != null ? ` · ${riskScore}` : ''}` : 'Pending'}
                          {riskStamp && <span style={{ color: riskComplete ? (isDarkMode ? `${riskColor}CC` : riskColor) : (isDarkMode ? 'rgba(255, 140, 0, 0.82)' : 'rgba(255, 140, 0, 0.9)'), fontWeight: 500 }}> · {riskStamp}</span>}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Summary strip — shown when risk IS completed and NOT in edit mode */}
            {riskComplete && !riskEditMode && (
              <div style={{
                background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderRadius: 0,
                padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Row 2: Compliance Confirmations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      I have considered:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { label: 'Client Risk', ok: !!clientRiskConsidered, docUrl: 'https://drive.google.com/file/d/1_7dX2qSlvuNmOiirQCxQb8NDs6iUSAhT/view?usp=sharing' },
                      { label: 'Transaction Risk', ok: !!transactionRiskConsidered, docUrl: 'https://drive.google.com/file/d/1sTRII8MFU3JLpMiUcz-Y6KBQ1pP1nKgT/view?usp=sharing' },
                      { label: 'Sanctions', ok: !!firmWideSanctionsConsidered, docUrl: 'https://drive.google.com/file/d/1y7fTLI_Dody00y9v42ohltQU-hnnYJ9P/view?usp=sharing' },
                      { label: 'AML Policy', ok: !!firmWideAMLConsidered, docUrl: 'https://drive.google.com/file/d/1opiC3TbEsdEH4ExDjckIhQzzsI3_wYYB/view?usp=sharing' },
                    ].map((item, idx) => (
                      <a
                        key={idx}
                        href={item.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${item.label} — ${item.ok ? 'Considered' : 'Not confirmed'}. Click to view policy.`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '4px 10px', borderRadius: 0,
                          background: item.ok
                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)')
                            : (isDarkMode ? 'rgba(160, 160, 160, 0.04)' : 'rgba(0,0,0,0.02)'),
                          border: `1px solid ${item.ok
                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.12)')
                            : (isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.04)')}`,
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {item.ok
                          ? <FaCheckCircle size={9} style={{ color: colours.green, opacity: 0.8 }} />
                          : <FaTimesCircle size={9} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, opacity: 0.5 }} />}
                        <span style={{ fontSize: 10, fontWeight: 600, color: item.ok ? (isDarkMode ? '#d1d5db' : '#374151') : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                          {item.label}
                        </span>
                      </a>
                    ))}
                    </div>
                  </div>

                  {/* Row 3: Assessment Q&A + Edit button */}
                  <div style={{
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(6, 23, 51, 0.3)' : 'rgba(244, 244, 246, 0.5)',
                    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)'}`,
                    borderRadius: 0
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        Assessment
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRiskEditMode(true); }}
                        style={{
                          padding: '3px 8px',
                          background: 'transparent',
                          color: colours.highlight,
                          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
                          borderRadius: 0,
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <FaEdit size={9} />
                        Edit
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {[
                        { question: 'Client Type', answer: riskClientType },
                        { question: 'How Introduced', answer: howIntroduced },
                        { question: 'Jurisdiction', answer: jurisdiction },
                        { question: 'Source of Funds', answer: sourceOfFunds },
                        { question: 'Source of Wealth', answer: sourceOfWealth },
                        { question: 'Destination of Funds', answer: destinationOfFunds },
                        { question: 'Funds Type', answer: fundsType },
                        { question: 'Value of Instruction', answer: valueOfInstruction },
                        { question: 'Limitation Period', answer: limitationPeriod },
                        { question: 'Transaction Risk', answer: riskLevel },
                      ].filter(item => item.answer && item.answer !== '—').map((item, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '5px 8px',
                            background: idx % 2 === 0 
                              ? (isDarkMode ? 'rgba(6, 23, 51, 0.3)' : 'rgba(0,0,0,0.018)')
                              : 'transparent',
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            {item.question}
                          </span>
                          <span style={{ 
                            fontSize: 10, 
                            fontWeight: 600, 
                            color: isDarkMode ? '#d1d5db' : '#374151',
                            textAlign: 'right',
                            maxWidth: '55%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.answer}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Inline risk assessment — compact workbench form */}
            {(!riskComplete || riskEditMode) && (() => {
              const liveScore = inlineRiskCore.clientTypeValue + inlineRiskCore.destinationOfFundsValue + inlineRiskCore.fundsTypeValue + inlineRiskCore.clientIntroducedValue + inlineRiskCore.limitationValue + inlineRiskCore.sourceOfFundsValue + inlineRiskCore.valueOfInstructionValue;
              const liveResult = (inlineRiskCore.limitationValue === 3 || liveScore >= 16) ? 'High Risk' : liveScore >= 11 ? 'Medium Risk' : liveScore > 0 ? 'Low Risk' : '';
              const liveColour = liveResult === 'High Risk' ? colours.cta : liveResult === 'Medium Risk' ? colours.orange : colours.green;
              const coreQuestions: { label: string; field: string; valueField: string; options: { key: number; text: string; short: string }[] }[] = [
                { label: 'Client Type', field: 'clientType', valueField: 'clientTypeValue', options: [
                  { key: 1, text: 'Individual or Company registered in England and Wales with Companies House', short: 'Individual / UK Company' },
                  { key: 2, text: 'Group Company or Subsidiary, Trust', short: 'Group / Trust' },
                  { key: 3, text: 'Non UK Company', short: 'Non-UK Company' },
                ]},
                { label: 'Destination', field: 'destinationOfFunds', valueField: 'destinationOfFundsValue', options: [
                  { key: 1, text: 'Client within UK', short: 'UK' },
                  { key: 2, text: 'Client in EU/3rd party in UK', short: 'EU / 3rd party UK' },
                  { key: 3, text: 'Outwith UK or Client outwith EU', short: 'Outside UK/EU' },
                ]},
                { label: 'Funds Type', field: 'fundsType', valueField: 'fundsTypeValue', options: [
                  { key: 1, text: 'Personal Cheque, BACS', short: 'Cheque / BACS' },
                  { key: 2, text: 'Cash payment if less than £1,000', short: 'Cash < £1k' },
                  { key: 3, text: 'Cash payment above £1,000', short: 'Cash > £1k' },
                ]},
                { label: 'Introduction', field: 'clientIntroduced', valueField: 'clientIntroducedValue', options: [
                  { key: 1, text: 'Existing client introduction, personal introduction', short: 'Existing / personal' },
                  { key: 2, text: 'Internet Enquiry', short: 'Internet' },
                  { key: 3, text: 'Other', short: 'Other' },
                ]},
                { label: 'Limitation', field: 'limitation', valueField: 'limitationValue', options: [
                  { key: 1, text: 'There is no applicable limitation period', short: 'N/A' },
                  { key: 2, text: 'There is greater than 6 months to the expiry of the limitation period', short: '> 6 months' },
                  { key: 3, text: 'There is less than 6 months to limitation expiry', short: '< 6 months' },
                ]},
                { label: 'Source of Funds', field: 'sourceOfFunds', valueField: 'sourceOfFundsValue', options: [
                  { key: 1, text: "Client's named account", short: 'Client account' },
                  { key: 2, text: "3rd Party UK or Client's EU account", short: '3rd party / EU' },
                  { key: 3, text: 'Any other account', short: 'Other' },
                ]},
                { label: 'Value', field: 'valueOfInstruction', valueField: 'valueOfInstructionValue', options: [
                  { key: 1, text: 'Less than £10,000', short: '< £10k' },
                  { key: 2, text: '£10,000 to £500,000', short: '£10k – £500k' },
                  { key: 3, text: 'Above £500,000', short: '> £500k' },
                ]},
              ];
              const selectStyle: React.CSSProperties = {
                flex: 1,
                minWidth: 0,
                padding: '4px 6px',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'inherit',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : colours.grey,
                border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)'}`,
                borderRadius: 0,
                cursor: 'pointer',
                appearance: 'auto' as any,
              };
              const complianceItems = [
                { label: 'Client Risk', question: 'I have considered client risk factors', state: inlineConsideredClientRisk, set: setInlineConsideredClientRisk, docUrl: 'https://drive.google.com/file/d/1_7dX2qSlvuNmOiirQCxQb8NDs6iUSAhT/view?usp=sharing', docLabel: 'Client Risk Assessment' },
                { label: 'Transaction Risk', question: 'I have considered transaction risk factors', state: inlineConsideredTransactionRisk, set: setInlineConsideredTransactionRisk, docUrl: 'https://drive.google.com/file/d/1sTRII8MFU3JLpMiUcz-Y6KBQ1pP1nKgT/view?usp=sharing', docLabel: 'Transaction Risk Assessment' },
                { label: 'Sanctions', question: 'I have considered the Firm Wide Sanctions Risk Assessment', state: inlineConsideredFirmWideSanctions, set: setInlineConsideredFirmWideSanctions, docUrl: 'https://drive.google.com/file/d/1y7fTLI_Dody00y9v42ohltQU-hnnYJ9P/view?usp=sharing', docLabel: 'Sanctions Risk Assessment' },
                { label: 'AML Policy', question: 'I have considered the Firm Wide AML policy', state: inlineConsideredFirmWideAML, set: setInlineConsideredFirmWideAML, docUrl: 'https://drive.google.com/file/d/1opiC3TbEsdEH4ExDjckIhQzzsI3_wYYB/view?usp=sharing', docLabel: 'AML Policy Document' },
              ];

              return (
                <div style={{
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.7)',
                  border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  borderRadius: 0,
                  padding: '10px 12px',
                }}>
                  {/* Header: title + live score + cancel */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.05)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        {riskEditMode ? 'Edit Assessment' : 'Risk Assessment'}
                      </span>
                      {liveResult && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 0, fontSize: 9, fontWeight: 700,
                          color: liveColour,
                          background: isDarkMode ? `${liveColour}18` : `${liveColour}12`,
                          border: `1px solid ${liveColour}30`,
                        }}>
                          {liveResult} · {liveScore}
                        </span>
                      )}
                    </div>
                    {riskEditMode && (
                      <button
                        type="button"
                        onClick={() => setRiskEditMode(false)}
                        style={{
                          padding: '2px 7px', background: 'transparent',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0,0,0,0.08)'}`,
                          borderRadius: 0, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        <FaTimes size={8} /> Cancel
                      </button>
                    )}
                  </div>

                  {/* Two-column layout: Scored questions LEFT | Considerations RIGHT */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                    {/* LEFT COLUMN — Scored questions */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 2 }}>
                        Scored Questions
                      </div>
                      {coreQuestions.map((q) => (
                        <div key={q.field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 80, flexShrink: 0,
                            fontSize: 10, fontWeight: 600,
                            color: (inlineRiskCore as any)[q.valueField]
                              ? (isDarkMode ? '#d1d5db' : colours.light.text)
                              : (isDarkMode ? colours.subtleGrey : colours.greyText),
                          }}>
                            {q.label}
                          </span>
                          <select
                            value={(inlineRiskCore as any)[q.valueField] || ''}
                            onChange={(e) => {
                              const key = Number(e.target.value);
                              const opt = q.options.find(o => o.key === key);
                              setInlineRiskCore(prev => ({ ...prev, [q.field]: opt?.text || '', [q.valueField]: key || 0 }));
                            }}
                            style={selectStyle}
                          >
                            <option value="">— Select —</option>
                            {q.options.map(o => (
                              <option key={o.key} value={o.key}>{o.short}</option>
                            ))}
                          </select>
                        </div>
                      ))}

                      {/* Limitation date (conditional) — nested under scored questions */}
                      {[2, 3].includes(inlineRiskCore.limitationValue) && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          marginLeft: 88,
                          padding: '5px 8px',
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                          borderLeft: `2px solid ${colours.highlight}`,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, whiteSpace: 'nowrap' }}>Date</span>
                          <input
                            type="date"
                            value={inlineLimitationDate ? inlineLimitationDate.toISOString().split('T')[0] : ''}
                            onChange={(e) => setInlineLimitationDate(e.target.value ? new Date(e.target.value) : undefined)}
                            disabled={inlineLimitationDateTbc}
                            style={{
                              ...selectStyle,
                              maxWidth: 120,
                              opacity: inlineLimitationDateTbc ? 0.4 : 1,
                            }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input
                              type="checkbox"
                              checked={inlineLimitationDateTbc}
                              onChange={(e) => {
                                setInlineLimitationDateTbc(e.target.checked);
                                if (e.target.checked) setInlineLimitationDate(undefined);
                              }}
                              style={{ margin: 0, accentColor: colours.highlight }}
                            />
                            <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>TBC</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN — Considerations */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 2 }}>
                        I have considered:
                      </div>
                      {complianceItems.map((item) => (
                        <div key={item.label} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 8px',
                          background: item.state === true
                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.03)')
                            : item.state === false
                              ? (isDarkMode ? 'rgba(214, 85, 65, 0.04)' : 'rgba(214, 85, 65, 0.02)')
                              : (isDarkMode ? 'rgba(6, 23, 51, 0.3)' : 'rgba(244, 244, 246, 0.5)'),
                          borderLeft: `2px solid ${item.state === true ? colours.green : item.state === false ? colours.cta : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)')}`,
                          transition: 'all 0.15s ease',
                        }}>
                          {/* Consideration name */}
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: 10, fontWeight: 500,
                            color: item.state === true ? (isDarkMode ? '#d1d5db' : colours.light.text) : (isDarkMode ? colours.subtleGrey : colours.greyText),
                            lineHeight: 1.3,
                          }}>
                            {item.label}
                          </span>
                          {/* Yes / No toggle buttons */}
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => item.set(true)}
                              style={{
                                padding: '2px 8px', borderRadius: 0, fontSize: 9, fontWeight: 700, fontFamily: 'inherit',
                                cursor: 'pointer',
                                background: item.state === true
                                  ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)')
                                  : 'transparent',
                                border: `1px solid ${item.state === true ? colours.green : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)')}`,
                                color: item.state === true ? colours.green : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                transition: 'all 0.12s ease',
                              }}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => item.set(false)}
                              style={{
                                padding: '2px 8px', borderRadius: 0, fontSize: 9, fontWeight: 700, fontFamily: 'inherit',
                                cursor: 'pointer',
                                background: item.state === false
                                  ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.06)')
                                  : 'transparent',
                                border: `1px solid ${item.state === false ? colours.cta : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)')}`,
                                color: item.state === false ? colours.cta : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                transition: 'all 0.12s ease',
                              }}
                            >
                              No
                            </button>
                          </div>
                          {/* Document link — hidden when Yes confirmed */}
                          {item.state !== true && (
                            <a
                              href={item.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`View ${item.docLabel}`}
                              style={{
                                flexShrink: 0, display: 'flex', alignItems: 'center',
                                color: isDarkMode ? colours.accent : colours.highlight,
                                opacity: 0.7,
                                transition: 'opacity 0.12s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                            >
                              <FaExternalLinkAlt size={9} />
                            </a>
                          )}
                        </div>
                      ))}

                      {/* Warning prompt when any compliance item is explicitly No */}
                      {complianceItems.some(item => item.state === false) && (
                        <div style={{
                          padding: '5px 8px',
                          background: isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.03)',
                          borderLeft: `2px solid ${colours.cta}`,
                          fontSize: 10, fontWeight: 500, lineHeight: 1.4,
                          color: isDarkMode ? colours.cta : '#9a2f1f',
                        }}>
                          Please review the relevant policy documents before proceeding.
                          <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {complianceItems.filter(item => item.state === false).map(item => (
                              <a
                                key={item.label}
                                href={item.docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 9, fontWeight: 700,
                                  color: isDarkMode ? colours.accent : colours.highlight,
                                  textDecoration: 'underline',
                                }}
                              >
                                {item.docLabel}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transaction risk level — only when transaction risk confirmed */}
                      {inlineConsideredTransactionRisk && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 8px',
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                          borderLeft: `2px solid ${colours.highlight}`,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, whiteSpace: 'nowrap' }}>Transaction Level</span>
                          {['Low Risk', 'Medium Risk', 'High Risk'].map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setInlineTransactionRiskLevel(level)}
                              style={{
                                padding: '3px 8px', borderRadius: 0, fontSize: 9, fontWeight: 600, fontFamily: 'inherit',
                                cursor: 'pointer',
                                background: inlineTransactionRiskLevel === level
                                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.08)')
                                  : 'transparent',
                                border: `1px solid ${inlineTransactionRiskLevel === level ? colours.highlight : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.06)')}`,
                                color: inlineTransactionRiskLevel === level ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                transition: 'all 0.12s ease',
                              }}
                            >
                              {level.replace(' Risk', '')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleInlineRiskSubmit}
                    disabled={!isInlineRiskComplete() || isRiskSubmitting}
                    style={{
                      width: '100%',
                      padding: '8px 0',
                      background: isInlineRiskComplete() ? colours.highlight : (isDarkMode ? 'rgba(6, 23, 51, 0.6)' : colours.grey),
                      border: 'none',
                      borderRadius: 0,
                      color: isInlineRiskComplete() ? '#FFFFFF' : (isDarkMode ? colours.subtleGrey : colours.greyText),
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: isInlineRiskComplete() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    {isRiskSubmitting ? (
                      <><FaClock size={10} /> Saving…</>
                    ) : (
                      <><FaShieldAlt size={10} /> {riskEditMode ? 'Update Assessment' : 'Submit Assessment'}</>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Matter Tab */}
        {activeTab === 'matter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              matterBannerStatus === 'complete' ? 'Matter opened' : 'Matter pending',
              matterBannerStatus,
              matterBannerStatus === 'complete' ? 'Matter link ready. Open in Clio or sync details.' : 'Open matter to generate Display Number and link client.',
              <FaFolderOpen size={12} />,
            )}
            {!hasMatter ? (
              <CompactMatterWizard
                inst={inst}
                deal={deal}
                eid={eid}
                risk={risk}
                payments={payments}
                documents={documents}
                poidData={localPoidData}
                teamData={teamData ?? null}
                currentUser={currentUser ?? null}
                isDarkMode={isDarkMode}
                feeEarner={feeEarner}
                areaOfWork={areaOfWork}
                instructionRef={instructionRef}
                onMatterSuccess={(mId) => {
                  if (onRefreshData) onRefreshData(instructionRef);
                  showToast({
                    type: 'success',
                    title: 'Matter Opened',
                    message: `Matter ${mId} created successfully`,
                  });
                }}
                onCancel={() => setShowLocalMatterModal(true)}
                showToast={showToast}
                hideToast={hideToast}
                demoModeEnabled={demoModeEnabled}
              />
            ) : (
              <>
                {/* Matter Content Card - expanded to match pipeline chip sections */}
                <div style={{
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                  border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  borderRadius: 0,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    
                    {/* Row 1: Primary chips */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {matterOpenDate && matterOpenDate !== '—' && (
                          <div
                            title="Matter opened"
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 10px', borderRadius: 0,
                              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                              borderLeft: `3px solid ${colours.highlight}`,
                            }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>Opened {matterOpenDate}</span>
                          </div>
                        )}
                        
                        <div
                          title={`Matter: ${matterRef}`}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 0,
                            background: isDarkMode ? 'rgba(160, 160, 160, 0.06)' : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                            borderLeft: `3px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.65)' : colours.greyText}`,
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>{matterRef}</span>
                        </div>

                        <div
                          title={`Status: ${matterStatus}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 0,
                            background: isMatterClosed
                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                              : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'),
                            border: `1px solid ${isMatterClosed
                              ? (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.16)')
                              : (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)')}`,
                            borderLeft: `3px solid ${isMatterClosed ? colours.green : colours.highlight}`,
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 600, color: isMatterClosed ? colours.green : colours.highlight }}>{matterStatus !== '—' ? matterStatus : 'Active'}</span>
                        </div>

                        {matterPracticeArea && matterPracticeArea !== '—' && (
                          <div
                            title={`Practice area: ${matterPracticeArea}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 10px', borderRadius: 0,
                              background: isDarkMode ? 'rgba(160, 160, 160, 0.06)' : 'rgba(0,0,0,0.02)',
                              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                              borderLeft: `3px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                            }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>{matterPracticeArea}</span>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {matterClioId && matterClioId !== '—' && (
                          <div style={{ 
                            display: 'flex', alignItems: 'center', gap: 6, 
                            fontSize: 11, 
                            color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : '#475569',
                            background: isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0,0,0,0.03)',
                            padding: '4px 10px',
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                            borderLeft: `3px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.65)' : colours.greyText}`,
                          }}>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{matterClioId}</span>
                          </div>
                        )}

                        {matterInstructionRef && matterInstructionRef !== '—' && (
                          <div style={{ 
                            display: 'flex', alignItems: 'center', gap: 6, 
                            fontSize: 10, 
                            color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : '#475569',
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                            padding: '4px 10px',
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.12)'}`,
                            borderLeft: `3px solid ${colours.highlight}`,
                          }}>
                            <span style={{ fontWeight: 700, letterSpacing: '0.4px', fontSize: 8, textTransform: 'uppercase', opacity: 0.8 }}>Instruction</span>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{matterInstructionRef}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Matter Portal row (passcode uses Clio Client ID) */}
                    {(() => {
                      return matterPortalPasscode ? (
                        <a
                          href={`https://instruct.helix-law.com/${matterPortalPasscode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 10px',
                            borderRadius: 0,
                            background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)',
                            border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)'}`,
                            textDecoration: 'none',
                            color: colours.green,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          title={`Open Matter Portal: instruct.helix-law.com/${matterPortalPasscode}`}
                        >
                          <img
                            src={clioLogo}
                            alt="Clio"
                            style={{ width: 12, height: 12, objectFit: 'contain', opacity: 0.9 }}
                          />
                          <span>Matter Portal</span>
                          <span style={{ fontFamily: 'monospace', opacity: 0.9 }}>{matterPortalPasscode}</span>
                          <span style={{
                            marginLeft: 2,
                            fontSize: 9,
                            fontWeight: 700,
                            color: matterPortalOpened ? colours.green : colours.cta,
                            opacity: 0.9,
                          }}>
                            {matterPortalOpened ? 'Opened' : 'Pending'}
                          </span>
                        </a>
                      ) : null;
                    })()}

                    {/* ND workspace placeholder (intentional stub this session) */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 0,
                      background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                      border: `1px dashed ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.85)' : '#475569',
                      fontSize: 10,
                    }}>
                      <Icon iconName="Cloud" style={{ fontSize: 10, color: colours.highlight }} />
                      <span style={{ fontWeight: 700 }}>ND Workspace</span>
                      <span style={{ opacity: 0.8 }}>Detection placeholder (not patched in this session)</span>
                    </div>

                    {/* Row 2: Assignment data bar */}
                    <div style={{ 
                      display: 'flex', flexWrap: 'wrap', gap: 0, 
                      padding: '10px 0',
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`
                    }}>
                      {[
                        { label: 'Responsible', value: matterResponsibleSolicitor !== '—' ? matterResponsibleSolicitor : feeEarner !== '—' ? feeEarner : null },
                        { label: 'Responsible Email', value: feeEarnerEmail || null },
                        { label: 'Practice Area', value: matterPracticeArea !== '—' ? matterPracticeArea : areaOfWork !== '—' ? areaOfWork : null },
                        { label: 'Status', value: matterStatus !== '—' ? matterStatus : null },
                        { label: 'Value', value: matterValue !== '—' ? matterValue : null },
                        { label: 'Supervising', value: matterSupervisingPartner !== '—' ? matterSupervisingPartner : null },
                        { label: 'Originating', value: matterOriginatingSolicitor !== '—' && matterOriginatingSolicitor !== matterResponsibleSolicitor ? matterOriginatingSolicitor : null },
                      ].filter(item => item.value).map((item, idx, arr) => (
                        <React.Fragment key={idx}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                              {item.label}
                            </span>
                            <span style={{ 
                              fontSize: 12, 
                              fontWeight: 500, 
                              lineHeight: '18px',
                              color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733',
                            }}>
                              {item.value}
                            </span>
                          </div>
                          {idx < arr.length - 1 && (
                            <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)'), margin: '4px 0' }} />
                          )}
                        </React.Fragment>
                      ))}
                      {/* Empty state if no data bar items */}
                      {![matterResponsibleSolicitor, matterPracticeArea, matterStatus, matterValue, matterSupervisingPartner, feeEarnerEmail].some(v => v && v !== '—') && (
                        <div style={{ padding: '0 14px', color: isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0', fontSize: 11 }}>
                          Matter details pending sync
                        </div>
                      )}
                    </div>

                    {/* Row 3: Client + Description section */}
                    {(matterClientName !== '—' || matterValue !== '—') && (
                      <div style={{ 
                        display: 'flex', alignItems: 'stretch', gap: 10,
                        padding: '10px 14px',
                        background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                        border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`,
                        borderRadius: 0,
                      }}>
                        {matterClientName !== '—' && (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Client</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: colours.highlight }}>{matterClientName}</span>
                            </div>
                            {matterDescription !== '—' && (
                              <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)'), alignSelf: 'stretch' }} />
                            )}
                          </>
                        )}
                        {matterDescription !== '—' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Description</span>
                            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>{matterDescription}</span>
                          </div>
                        )}
                        {matterValue !== '—' && (
                          <>
                            <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)'), alignSelf: 'stretch' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Value</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733' }}>{matterValue}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Row 4: Lifecycle + Origin */}
                    {([
                      matterOpenDate,
                      matterCloseDate,
                      matterSourceDisplay,
                      matterReferrer,
                    ].some(v => v && v !== '—')) && (
                      <div style={{
                        padding: '12px 14px',
                        background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : '#e1e1e1'}`,
                        borderRadius: 0,
                        fontSize: 12,
                        lineHeight: 1.65,
                        color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733',
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FaLink size={10} style={{ opacity: 0.6 }} />
                          Matter Lifecycle & Origin
                        </div>
                        <div style={{ opacity: 0.85, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {matterOpenDate && matterOpenDate !== '—' && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.6)' : '#6B6B6B' }}>Opened:</strong> {matterOpenDate}</span>
                          )}
                          {matterCloseDate && matterCloseDate !== '—' && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.6)' : '#6B6B6B' }}>Closed:</strong> {matterCloseDate}</span>
                          )}
                          {matterSourceDisplay && matterSourceDisplay !== '—' && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.6)' : '#6B6B6B' }}>Source:</strong> {matterSourceDisplay}</span>
                          )}
                          {matterReferrer && matterReferrer !== '—' && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(160, 160, 160, 0.6)' : '#6B6B6B' }}>Referrer:</strong> {matterReferrer}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Row 5: Opening trail */}
                    {matterOpenTrail.length > 0 && (
                      <div style={{
                        padding: '10px 0',
                        background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                        border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`,
                        borderRadius: 0,
                      }}>
                        <div style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          marginBottom: 8,
                          padding: '0 14px',
                        }}>
                          Opening Trail
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                          {matterOpenTrail.map((item, idx, arr) => (
                            <React.Fragment key={item.label}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{item.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>{item.value}</span>
                              </div>
                              {idx < arr.length - 1 && (
                                <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)'), margin: '4px 0' }} />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Row 6: Collected matter/client fields */}
                    {([
                      matterClientName,
                      matterClientId,
                      matterClientType,
                      matterClientEmail,
                      matterClientPhone,
                      matterClientCompany,
                      matterDescription,
                      matterInstructionRef,
                      matterClioId,
                      matterOpenTimestampRaw,
                    ].some(v => v && v !== '—')) && (
                      <div style={{
                        padding: '10px 0',
                        background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.25)',
                        border: `1px solid ${isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)')}`,
                        borderRadius: 0,
                      }}>
                        <div style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          marginBottom: 8,
                          padding: '0 14px',
                        }}>
                          Matter Collected Fields
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                          {[
                            { label: 'Client Name', value: matterClientName !== '—' ? matterClientName : null },
                            { label: 'Clio Client ID', value: matterClientId !== '—' ? matterClientId : null },
                            { label: 'Client Type', value: matterClientType !== '—' ? matterClientType : null },
                            { label: 'Client Email', value: matterClientEmail !== '—' ? matterClientEmail : null },
                            { label: 'Client Phone', value: matterClientPhone !== '—' ? matterClientPhone : null },
                            { label: 'Company', value: matterClientCompany !== '—' ? matterClientCompany : null },
                            { label: 'Matter Description', value: matterDescription !== '—' ? matterDescription : null },
                            { label: 'Instruction Ref', value: matterInstructionRef !== '—' ? matterInstructionRef : null },
                            { label: 'Matter ID', value: matterClioId !== '—' ? matterClioId : null },
                            { label: 'Opened Raw', value: matterOpenTimestampRaw ? String(matterOpenTimestampRaw) : null },
                          ].filter(item => item.value).map((item, idx, arr) => (
                            <React.Fragment key={item.label}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{item.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733' }}>{item.value}</span>
                              </div>
                              {idx < arr.length - 1 && (
                                <div style={{ width: 1, background: isDarkMode ? `${colours.dark.border}40` : (colours.highlightNeutral || 'rgba(0,0,0,0.06)'), margin: '4px 0' }} />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* Payment Link Request Modal */}
      {showPaymentLinkModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPaymentLinkModal(false);
              setCreatedPaymentLink(null);
              setPaymentLinkAmount('');
              setPaymentLinkDescription('');
              setPaymentLinkIncludesVat(true);
            }
          }}
        >
          <div
            style={{
              background: isDarkMode ? 'rgba(8, 28, 48, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
              borderRadius: 0,
              padding: 24,
              width: 400,
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 0,
                  background: `${colours.highlight}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FaLink size={14} style={{ color: colours.highlight }} />
                </div>
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : 'rgba(6, 23, 51, 0.9)',
                }}>
                  Create client payment link
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentLinkModal(false);
                  setCreatedPaymentLink(null);
                  setPaymentLinkAmount('');
                  setPaymentLinkDescription('');
                  setPaymentLinkIncludesVat(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}
              >
                <FaTimes size={14} />
              </button>
            </div>

            {/* Modal Content */}
            {createdPaymentLink ? (
              /* Success state - show created link */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{
                  padding: 12,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                  border: `1px solid ${colours.highlight}`,
                  borderRadius: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <FaCheckCircle size={14} style={{ color: colours.highlight }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: colours.highlight }}>
                      Payment link created
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: isDarkMode ? 'rgba(243, 244, 246, 0.7)' : 'rgba(6, 23, 51, 0.65)',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    padding: '8px 10px',
                    background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: 0,
                  }}>
                    {createdPaymentLink}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const copied = await safeCopy(createdPaymentLink);
                      if (copied) showToast({ type: 'success', message: 'Payment link copied to clipboard' });
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '10px 16px',
                      background: colours.highlight,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FaCopy size={10} />
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(createdPaymentLink, '_blank')}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      color: colours.highlight,
                      border: `1px solid ${colours.highlight}`,
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Open
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedPaymentLink(null);
                    setPaymentLinkAmount('');
                    setPaymentLinkDescription('');
                    setPaymentLinkIncludesVat(true);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                    borderRadius: 0,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Create Another
                </button>
              </div>
            ) : (
              /* Form state - enter amount */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  Generates a one-off Stripe Checkout link for this instruction. Nothing is sent automatically — copy the link and send it to the client.
                </div>

                {/* Amount Input */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 6,
                  }}>
                    Amount (GBP) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    }}>—</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={paymentLinkAmount}
                      onChange={(e) => setPaymentLinkAmount(e.target.value)}
                      placeholder="1.00"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 28px',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                        borderRadius: 0,
                        color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colours.highlight;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)';
                      }}
                    />
                  </div>
                </div>

                {/* Description Input */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 6,
                  }}>
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={paymentLinkDescription}
                    onChange={(e) => setPaymentLinkDescription(e.target.value)}
                    placeholder={`Payment for ${deal?.instructionRef || deal?.instruction_ref || 'instruction'}`}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 11,
                      background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                      borderRadius: 0,
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colours.highlight;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)';
                    }}
                  />
                </div>

                {/* VAT Confirmation */}
                {(() => {
                  const amt = parseFloat(paymentLinkAmount) || 0;
                  const netAmount = amt;
                  const vatAmount = paymentLinkIncludesVat ? (amt * 0.2) : 0;
                  const totalAmount = paymentLinkIncludesVat ? (amt * 1.2) : amt;
                  
                  return (
                    <div
                      onClick={() => setPaymentLinkIncludesVat(!paymentLinkIncludesVat)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '12px',
                        background: paymentLinkIncludesVat 
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)')
                          : (isDarkMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.02)'),
                        border: `1px solid ${paymentLinkIncludesVat ? colours.highlight : (isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)')}`,
                        borderRadius: 0,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: 18,
                        height: 18,
                        borderRadius: 0,
                        border: `2px solid ${paymentLinkIncludesVat ? colours.green : (isDarkMode ? 'rgba(160, 160, 160, 0.3)' : 'rgba(0, 0, 0, 0.15)')}`,
                        background: paymentLinkIncludesVat ? colours.green : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                        marginTop: 2,
                      }}>
                        {paymentLinkIncludesVat && <FaCheck size={10} style={{ color: '#FFFFFF' }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)',
                        }}>
                          {paymentLinkIncludesVat ? 'Add VAT (20%)' : 'No VAT'}
                        </div>
                        <div style={{
                          fontSize: 9,
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          marginTop: 4,
                        }}>
                          {paymentLinkIncludesVat 
                            ? 'Charges the entered amount + 20% VAT (total shown below)'
                            : 'Charges exactly the entered amount (no VAT added)'}
                        </div>
                        {/* Show breakdown when amount is entered */}
                        {amt > 0 && paymentLinkIncludesVat && (
                          <div style={{
                            marginTop: 8,
                            padding: '8px 10px',
                            background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                            borderRadius: 0,
                            fontSize: 10,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Net:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.75)' }}>—{netAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }}>VAT (20%):</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.8)' : 'rgba(6, 23, 51, 0.75)' }}>—{vatAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`, paddingTop: 4 }}>
                              <span style={{ fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)' }}>Total:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: colours.green }}>—{totalAmount.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                        {amt > 0 && !paymentLinkIncludesVat && (
                          <div style={{
                            marginTop: 8,
                            padding: '8px 10px',
                            background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                            borderRadius: 0,
                            fontSize: 10,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)' }}>Total (no VAT):</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.85)' }}>—{totalAmount.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Instruction Ref (read-only) */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 6,
                  }}>
                    Instruction Reference
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    background: isDarkMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.02)',
                    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                    borderRadius: 0,
                    color: colours.highlight,
                  }}>
                    {deal?.instructionRef || deal?.instruction_ref || instructionRef || '—'}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentLinkModal(false);
                      setPaymentLinkAmount('');
                      setPaymentLinkDescription('');
                      setPaymentLinkIncludesVat(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: 'transparent',
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePaymentLink}
                    disabled={isCreatingPaymentLink || !paymentLinkAmount}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '10px 16px',
                      background: isCreatingPaymentLink || !paymentLinkAmount ? `${colours.highlight}60` : colours.highlight,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: isCreatingPaymentLink || !paymentLinkAmount ? 'not-allowed' : 'pointer',
                      opacity: isCreatingPaymentLink ? 0.7 : 1,
                    }}
                  >
                    {isCreatingPaymentLink ? (
                      <>
                        <FaClock size={10} style={{ animation: 'spin 1s linear infinite' }} />
                        Creating...
                      </>
                    ) : (
                      <>
                        <FaLink size={10} />
                        Generate link
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Matter Opening Modal — portalled to body to avoid transform/overflow clipping */}
      {(() => { if (showLocalMatterModal) console.log('[MATTER-DEBUG] Matter modal guard: showLocalMatterModal =', showLocalMatterModal, ', inst =', !!inst, ', inst?.InstructionRef =', inst?.InstructionRef, ', item?.prospectId =', item?.prospectId); return null; })()}
      {showLocalMatterModal && (inst || item) && createPortal(
        <div
          style={{
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
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLocalMatterModal(false); }}
        >
          <div style={{
            background: isDarkMode ? colours.dark.background : '#ffffff',
            borderRadius: '12px',
            maxWidth: '1100px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: isDarkMode ? '0 20px 60px rgba(0,0,0,0.8)' : '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <FlatMatterOpening
              key={`inline-matter-${inst?.InstructionRef || inst?.instructionRef || item?.prospectId || 'default'}`}
              poidData={localPoidData}
              setPoidData={setLocalPoidData}
              teamData={teamData}
              userInitials={(() => {
                // Derive userInitials from currentUser email ? teamData lookup, or feeEarner match
                if (currentUser?.Email && teamData) {
                  const match = teamData.find(t => t.Email?.toLowerCase() === currentUser.Email!.toLowerCase());
                  if (match?.Initials) return match.Initials.toUpperCase();
                }
                if (feeEarner && feeEarner !== '—' && teamData) {
                  const match = teamData.find(t =>
                    t['Full Name']?.toLowerCase() === feeEarner.toLowerCase() ||
                    t['Nickname']?.toLowerCase() === feeEarner.toLowerCase() ||
                    t['Initials']?.toLowerCase() === feeEarner.toLowerCase()
                  );
                  if (match?.Initials) return match.Initials.toUpperCase();
                }
                return '';
              })()}
              userData={null}
              instructionRef={inst?.InstructionRef || inst?.instructionRef || deal?.InstructionRef || ''}
              stage={inst?.Stage || inst?.stage || 'New Matter'}
              clientId={inst?.ProspectId?.toString() || inst?.prospectId?.toString() || inst?.ClientId?.toString() || item?.prospectId?.toString() || ''}
              feeEarner={feeEarner !== '—' ? feeEarner : undefined}
              hideClientSections={true}
              initialClientType={inst?.ClientType || inst?.clientType || ''}
              instructionPhone={inst?.Phone || inst?.phone || ''}
              instructionRecords={[{
                ...(inst || {}),
                // Attach data from item so generateSampleJson can build instruction_summary
                idVerifications: inst?.idVerifications || (eid ? [eid] : []),
                riskAssessments: inst?.riskAssessments || (risk ? [risk] : []),
                payments: inst?.payments || payments || [],
                documents: inst?.documents || documents || [],
                // Fallback fields from deal/item when inst is missing
                ServiceDescription: inst?.ServiceDescription || deal?.ServiceDescription || '',
                ProspectId: inst?.ProspectId || item?.prospectId || '',
                InstructionRef: inst?.InstructionRef || deal?.InstructionRef || '',
              }]}
              onBack={() => setShowLocalMatterModal(false)}
              onMatterSuccess={(matterId) => {
                setShowLocalMatterModal(false);
                if (onRefreshData) onRefreshData(instructionRef);
                showToast({
                  type: 'success',
                  title: 'Matter Opened',
                  message: `Matter ${matterId} created successfully`,
                });
              }}
              onRunIdCheck={onTriggerEID ? () => {
                setShowLocalMatterModal(false);
                openTriggerEidConfirm();
              } : undefined}
              demoModeEnabled={demoModeEnabled}
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default InlineWorkbench;
