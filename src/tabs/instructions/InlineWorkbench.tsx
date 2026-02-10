import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@fluentui/react';
import type { TeamData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useToast } from '../../components/feedback/ToastProvider';
import { resolveActiveCampaignContactId } from '../../utils/resolveActiveCampaignContactId';
import activecampaignIcon from '../../assets/activecampaign.svg';
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
  FaEnvelope,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileAlt,
  FaFolder,
  FaRegFolder,
  FaHome,
  FaIdCard,
  FaLink,
  FaPassport,
  FaReceipt,
  FaShieldAlt,
  FaTimes,
  FaUser,
  FaEdit,
} from 'react-icons/fa';
import RiskAssessmentPage from './RiskAssessmentPage';
import FlatMatterOpening from './MatterOpening/FlatMatterOpening';
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
  enableTabStages?: boolean; // Show ID/Pay/Risk/Matter/Docs tabs (default true)
  onDocumentPreview?: (doc: any) => void;
  onOpenRiskAssessment?: (instruction: any) => void;
  onOpenMatter?: (instruction: any) => void;
  onTriggerEID?: (instructionRef: string) => void | Promise<void>;
  onOpenIdReview?: (instructionRef: string) => void;
  onConfirmBankPayment?: (paymentId: string, confirmedDate: string) => void | Promise<void>;
  onRefreshData?: () => void | Promise<void>;
  onClose?: () => void;
  currentUser?: { FullName?: string; Email?: string } | null;
  onRiskAssessmentSave?: (risk: any) => void;
  demoModeEnabled?: boolean;
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
}) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab);
  const [showLocalRiskModal, setShowLocalRiskModal] = useState(false);
  const [showLocalMatterModal, setShowLocalMatterModal] = useState(false);
  const [localPoidData, setLocalPoidData] = useState<POID[]>([]);
  const [activeContextStage, setActiveContextStage] = useState<ContextStageKey | null>(initialContextStage);

  // Sync activeTab when initialTab prop changes (e.g. parent switches to matter tab)
  useEffect(() => {
    console.log('[MATTER-DEBUG] InlineWorkbench useEffect initialTab =', initialTab, '→ setActiveTab');
    setActiveTab(initialTab);
  }, [initialTab]);
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
  const [copiedPaymentRefId, setCopiedPaymentRefId] = useState<string | null>(null);
  const { showToast, updateToast, hideToast } = useToast();
  const [eidProcessingState, setEidProcessingState] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const eidProcessingToastRef = React.useRef<string | null>(null);
  const [emailOverrideTo, setEmailOverrideTo] = useState<string>('');
  const [emailOverrideCc, setEmailOverrideCc] = useState<string>('');
  const [useManualToRecipient, setUseManualToRecipient] = useState<boolean>(false);
  const [useManualCcRecipients, setUseManualCcRecipients] = useState<boolean>(false);
  
  // Pitch content fetch state (for when deal exists but pitch email content wasn't included)
  const [fetchedPitchContent, setFetchedPitchContent] = useState<any>(null);
  const [isFetchingPitchContent, setIsFetchingPitchContent] = useState(false);
  
  // Payment Link Request state
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
  const [paymentLinkAmount, setPaymentLinkAmount] = useState<string>('');
  const [paymentLinkDescription, setPaymentLinkDescription] = useState<string>('');
  const [paymentLinkIncludesVat, setPaymentLinkIncludesVat] = useState(true);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);
  const [createdPaymentLink, setCreatedPaymentLink] = useState<string | null>(null);

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
  const documents = item?.documents || inst?.documents || [];
  const payments = inst?.payments || [];
  const clients = item?.clients || [];
  const matters = item?.matters || (inst as any)?.matters || [];
  
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
  const instructionRef = inst?.InstructionRef || deal?.InstructionRef || '';

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
  const dobRaw = getValue(['DateOfBirth', 'dateOfBirth', 'DOB'], '') || inst?.DOB || inst?.DateOfBirth;
  const formatDate = (raw: any) => {
    if (!raw || raw === '—') return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };


  const formatMoney = (raw: any): string => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
    } catch {
      return `£${n.toFixed(2)}`;
    }
  };

  const enquiryValue = (() => {
    if (!enquiryValueRaw || enquiryValueRaw === '—') return '—';
    const raw = String(enquiryValueRaw).trim();
    if (!raw) return '—';
    if (/[£$€]/.test(raw)) return raw;
    const numeric = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(numeric)) return formatMoney(numeric);
    return raw;
  })();

  const enquirySourceSummary = (() => {
    if (ultimateSource && ultimateSource !== '—') return String(ultimateSource);
    if (campaign && campaign !== '—') return String(campaign);
    if (referralUrl && referralUrl !== '—') return String(referralUrl);
    return '—';
  })();
  
  // Submission date (after formatDate is defined)
  const submissionDateRaw = getValue(['Touchpoint_Date', 'Date_Created', 'DateCreated', 'SubmissionDate', 'submission_date', 'DateSubmitted', 'InstructionDate', 'created_at', 'createdAt']);
  const submissionDate = formatDate(submissionDateRaw);

  // Timeline dates - include effectivePitch for fetched pitch content
  const pitchDateRaw = deal?.PitchedDate || deal?.pitchedDate || deal?.CreatedDate || deal?.createdDate || effectivePitch?.CreatedAt || effectivePitch?.createdAt || pitch?.CreatedAt || pitch?.createdAt || null;
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
  const nationalityFull = getValue(['Nationality', 'nationality'], '') || inst?.Nationality || inst?.nationality || '—';
  
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
  const passport = getValue(['PassportNumber', 'passportNumber'], '') || inst?.PassportNumber || inst?.passportNumber || '—';
  const license = getValue(['DriversLicenseNumber', 'driversLicenseNumber', 'DrivingLicenseNumber'], '') || inst?.DriversLicenseNumber || inst?.driversLicenseNumber || inst?.DrivingLicenseNumber || '—';
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
    if (!expiryRaw || expiryRaw === '—') return { color: isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', label: '' };
    const expiry = new Date(expiryRaw);
    if (Number.isNaN(expiry.getTime())) return { color: isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', label: '' };
    
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const maxDays = 3 * 365; // 3 years in days
    
    if (diffDays <= 0) {
      return { color: '#ef4444', label: 'Expired' }; // Red for expired
    }
    if (diffDays <= 90) {
      return { color: '#f97316', label: 'Expiring soon' }; // Orange for < 3 months
    }
    if (diffDays <= 365) {
      return { color: '#eab308', label: '' }; // Yellow for < 1 year
    }
    
    // Gradient from yellow (1 year) to green (3 years)
    const ratio = Math.min(diffDays / maxDays, 1);
    if (ratio >= 0.9) return { color: '#22c55e', label: '' }; // Full green
    if (ratio >= 0.66) return { color: '#84cc16', label: '' }; // Lime
    return { color: '#a3e635', label: '' }; // Light green
  };
  
  // Address
  const getInstValue = (keys: string[]) => {
    if (!inst) return undefined;
    for (const k of keys) {
      if (inst[k] && inst[k] !== '—') return inst[k];
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
          rawResponse: {
            demo: true,
            provider: 'DEMO',
            status: eidStatusValue || (eid ? 'complete' : 'idle'),
          },
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
        try { await onRefreshData(); } catch { /* silent */ }
      }
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

    const raw = verificationDetails ? parseRawResponse(verificationDetails.rawResponse) : null;
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
  }, [verificationDetails, eidDate, parseRawResponse, formatMaybeDate, isMeaningfulFailureReason]);

  const verificationMeta = React.useMemo(() => {
    const raw = verificationDetails ? parseRawResponse(verificationDetails.rawResponse) : null;

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
  }, [verificationDetails, normaliseMetaText, parseRawResponse]);
  
  // Payment status
  const hasSuccessfulPayment = payments.some((p: any) => 
    p.payment_status === 'succeeded' || p.payment_status === 'confirmed'
  );
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
  const instructionStage = String(inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.stage ?? '').trim();
  const isInstructionInitialised = /initiali[sz]ed/i.test(instructionStage);
  const feeEarner = matter?.ResponsibleSolicitor || matter?.['Responsible Solicitor'] || getValue(['HelixContact', 'FeeEarner', 'feeEarner', 'ResponsibleSolicitor']);

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

  const getStatusColors = React.useCallback((status: StageStatus) => {
    if (status === 'complete') return { 
      bg: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
      border: '#22c55e',
      text: '#22c55e'
    };
    if (status === 'review') return {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
      border: '#ef4444',
      text: '#ef4444'
    };
    if (status === 'processing') return {
      bg: isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.08)',
      border: '#f59e0b',
      text: '#f59e0b'
    };
    if (status === 'neutral') return {
      bg: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.05)',
      border: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.16)',
      text: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)'
    };
    return {
      bg: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
      border: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.22)',
      text: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)'
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
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 14px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: colors.text, display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.78)', marginLeft: 4 }}>{prompt}</span>
        </div>
        {action && <div>{action}</div>}
      </div>
    );
  };

  const isInstructedComplete = Boolean(submissionDateRaw && submissionDateRaw !== '—');
  const instructedStatus: StageStatus = isInstructedComplete
    ? 'complete'
    : (isInstructionInitialised ? 'complete' : 'pending');

  // Timeline stages - unified navigation: Enquiry → Pitch → Instructed → ID → Pay → Risk → Matter → Docs
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
        label: 'Instructed', 
        icon: <FaFileAlt size={10} />,
        date: submissionDate !== '—' ? submissionDate : null,
        dateRaw: submissionDateRaw,
        isComplete: isInstructedComplete,
        hasIssue: false,
        status: instructedStatus,
        navigatesTo: 'details' as WorkbenchTab,
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
        key: 'risk' as const,
        label: 'Risk', 
        icon: <FaShieldAlt size={10} />,
        date: null,
        dateRaw: null,
        isComplete: riskComplete && !isHighRisk && !isMediumRisk,
        hasIssue: isHighRisk || isMediumRisk,
        status: (showLocalRiskModal ? 'processing' : stageStatuses?.risk || (riskComplete ? ((isHighRisk || isMediumRisk) ? 'review' : 'complete') : 'pending')) as StageStatus,
        navigatesTo: 'risk' as WorkbenchTab,
      },
      { 
        key: 'matter' as const,
        label: 'Matter', 
        icon: hasMatter ? <FaFolder size={10} /> : <FaRegFolder size={10} />,
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
  }, [prospectId, hasId, eidStatus, eidProcessingState, hasSuccessfulPayment, hasFailedPayment, documents.length, riskComplete, isHighRisk, isMediumRisk, showLocalRiskModal, showLocalMatterModal, hasMatter, stageStatuses, pitchDate, pitchDateRaw, submissionDate, submissionDateRaw, paymentDate, paymentDateRaw, matterOpenDate, matterOpenDateRaw, firstDocUploadDate, firstDocUploadDateRaw, isInstructedComplete, instructedStatus]);

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

  // Palette helper for tab/timeline statuses
  const getStagePalette = (stage: (typeof timelineStages)[number]) => {
    if (stage.status === 'complete') return { 
      bg: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
      border: isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.35)',
      text: '#22c55e',
      line: '#22c55e',
    };
    if (stage.status === 'review') return {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
      border: isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.35)',
      text: '#ef4444',
      line: '#ef4444',
    };
    if (stage.status === 'processing') return {
      bg: isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
      border: isDarkMode ? 'rgba(251, 191, 36, 0.4)' : 'rgba(251, 191, 36, 0.35)',
      text: '#f59e0b',
      line: '#f59e0b',
    };
    return {
      bg: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.05)',
      border: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
      text: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.45)',
      line: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
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
    bg: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(148, 163, 184, 0.04)',
    border: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
    text: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)',
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
      showToast({ type: 'warning', message: 'Please enter a valid amount (at least £1)' });
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
    const bg = status === 'pass' ? 'rgba(34, 197, 94, 0.12)' 
      : status === 'fail' ? 'rgba(239, 68, 68, 0.12)'
      : status === 'warn' ? 'rgba(239, 68, 68, 0.12)'
      : 'rgba(148, 163, 184, 0.1)';
    const color = status === 'pass' ? colours.green 
      : status === 'fail' ? colours.cta
      : status === 'warn' ? colours.cta
      : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)');
    return (
      <span style={{
        fontSize: 9,
        padding: '3px 8px',
        borderRadius: 4,
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
      // Complete steps (including when active AND complete) show green
      if (isComplete || (isActive && label === 'Succeeded')) return { 
        bg: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
        border: '#22c55e',
        text: '#22c55e'
      };
      // Active but not complete (e.g. requires_action) shows amber
      if (isActive) return {
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
        background: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.05)',
        border: `1px dashed ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.25)'}`,
        borderRadius: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700, marginBottom: 8 }}>
          <FaBuilding size={10} /> Confirm Bank Payment
        </div>
        <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)', marginBottom: 10, lineHeight: 1.4 }}>
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
              background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
              borderRadius: 3,
              fontSize: 11,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            disabled={!confirmDate || isConfirming}
            onClick={(e) => { e.stopPropagation(); void handleConfirm(); }}
            style={{
              padding: '6px 14px',
              background: confirmDate ? '#22c55e' : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'),
              color: confirmDate ? '#ffffff' : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
              border: 'none',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              cursor: confirmDate && !isConfirming ? 'pointer' : 'default',
              opacity: isConfirming ? 0.7 : 1,
            }}
          >
            {isConfirming ? 'Saving…' : 'Confirm'}
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

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Payment Records Section - styled like Identity tab */}
        <div style={{
          background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
          borderRadius: 0,
          overflow: 'hidden',
        }}>
          {/* Section Header - matches Identity tab pattern */}
          <div style={{
            padding: '8px 14px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)',
            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <FaCreditCard size={11} /> Payment Records
            </div>
            {isLocalEnv && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRequestPaymentLink?.(); }}
                title="Generate a Stripe payment link (copy & send to the client)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  background: colours.highlight,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 0,
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2d7ab8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colours.highlight;
                }}
              >
                <FaLink size={9} />
                Create payment link
              </button>
            )}
          </div>

          {/* No payments state */}
          {activePayments.length === 0 ? (
            <div style={{ 
              textAlign: 'center',
              padding: '24px 0',
              color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
            }}>
              <FaCreditCard size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div style={{ fontSize: 11 }}>No payment records</div>
            </div>
          ) : (
          <>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '70px 90px 1fr 160px 70px 60px 90px 24px',
              gap: 8,
              padding: '8px 12px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(0, 0, 0, 0.015)',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ref</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Currency</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Method</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Status</span>
              <span></span>
            </div>

          {/* Payment Rows */}
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
              : '—';
            const formattedTime = paymentDate
              ? new Date(paymentDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              : '';
            
            const currentJourneyIndex = isSuccess ? 2 : status === 'requires_action' ? 1 : 0;
            
            // Determine payment method - check multiple possible field names and infer from payment_intent_id
            const methodRaw = (
              payment.payment_method || 
              payment.payment_type || 
              payment.method || 
              payment.type || 
              payment.paymentMethod ||
              payment.PaymentMethod ||
              payment.PaymentType ||
              ''
            ).toString().toLowerCase();
            // Check metadata for method
            const meta = typeof payment.metadata === 'object' ? payment.metadata : {};
            const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
            // Check payment_intent_id prefix (bank_ = bank transfer, pi_ = stripe card)
            const intentId = (payment.payment_intent_id || payment.paymentIntentId || '').toString();
            const intentIsBank = intentId.startsWith('bank_');
            const intentIsCard = intentId.startsWith('pi_');
            // Determine final method
            const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
            const isCard = combinedMethod.includes('card') || combinedMethod.includes('stripe') || combinedMethod === 'cc' || intentIsCard;
            const isBank = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || combinedMethod.includes('ach') || intentIsBank;
            const methodLabel = isCard ? 'Card' : isBank ? 'Bank' : combinedMethod ? combinedMethod.slice(0, 6) : '';
            const serviceLabel = deal?.ServiceDescription || deal?.serviceDescription || deal?.service_description || payment.product_description || payment.description || payment.product || 'Payment on Account';
            const currencyLabel = (payment.currency || 'GBP').toString().toUpperCase();
            const paymentIdRaw = (payment.payment_id || payment.stripe_payment_id || payment.id || '—').toString();
            const paymentIdDisplay = paymentIdRaw === '—' ? '—' : paymentIdRaw;
            const paymentRef = instructionRef || payment.instruction_ref || '—';

            return (
              <div key={paymentId}>
                {/* Payment Row */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPayment(isExpanded ? null : paymentId);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 90px 1fr 160px 70px 60px 90px 24px',
                    gap: 8,
                    padding: '10px 12px',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded 
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                      : 'transparent',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)'}`,
                    transition: 'background 0.15s ease',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ 
                        fontSize: 10, 
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                      }}>
                        {formattedDate}
                      </span>
                      {formattedTime && (
                        <span style={{ 
                          fontSize: 9, 
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)',
                        }}>
                          {formattedTime}
                        </span>
                      )}
                    </div>
                    <span style={{ 
                      fontSize: 12, 
                      fontWeight: 600, 
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                      fontFamily: 'monospace',
                    }}>
                      £{Number(payment.amount || 0).toLocaleString()}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, justifyContent: 'center' }}>
                      <span style={{ 
                        fontSize: 11, 
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {payment.description || payment.product_description || 'Payment on Account'}
                      </span>
                      <span style={{
                        fontSize: 9,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)',
                        fontFamily: 'monospace',
                        whiteSpace: 'normal',
                        wordBreak: 'break-all',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      }}>
                        ID {paymentIdDisplay}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontSize: 11,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)',
                        fontFamily: 'monospace',
                        whiteSpace: 'normal',
                        wordBreak: 'break-all',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      }}>
                        {paymentRef}
                      </span>
                      {paymentRef !== '—' && (
                        <button
                          type="button"
                          onClick={async (event) => {
                            event.stopPropagation();
                            const copied = await safeCopy(paymentRef);
                            if (copied) {
                              setCopiedPaymentRefId(paymentId);
                              showToast({ type: 'success', message: 'Ref copied to clipboard' });
                              window.setTimeout(() => {
                                setCopiedPaymentRefId((current) => (current === paymentId ? null : current));
                              }, 1400);
                            }
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            padding: '0 4px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 0,
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                            fontSize: 8,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                          title="Copy ref"
                          aria-label="Copy ref"
                        >
                          {copiedPaymentRefId === paymentId ? <FaCheck size={9} /> : <FaCopy size={9} />}
                        </button>
                      )}
                    </div>
                    <span style={{
                      fontSize: 10,
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)',
                      textTransform: 'uppercase',
                    }}>
                      {currencyLabel}
                    </span>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                  }}>
                    {isCard ? <FaCreditCard size={10} /> : isBank ? <FaBuilding size={10} /> : <span>—</span>}
                    {methodLabel && <span style={{ fontSize: 9, fontWeight: 600 }}>{methodLabel}</span>}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 20,
                      fontSize: 9,
                      padding: '0 8px',
                      borderRadius: 0,
                      background: isSuccess 
                        ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                        : isFailed 
                          ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                          : (isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)'),
                      border: `1px solid ${statusColor}`,
                      color: statusColor,
                      fontWeight: 600,
                      textTransform: 'lowercase',
                    }}>
                      {status}
                    </span>
                  </span>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginLeft: 6,
                    width: 20,
                    height: 20,
                    borderRadius: 0,
                    background: isExpanded 
                      ? colours.highlight
                      : 'transparent',
                    border: `1px solid ${isExpanded ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)')}`,
                    borderLeft: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(0, 0, 0, 0.08)'}`,
                    color: isExpanded 
                      ? '#FFFFFF'
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'),
                    fontSize: 10,
                    transition: 'all 0.15s ease',
                  }}>
                    <Icon iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 10 } }} />
                  </span>
                </div>

                {/* Expanded Payment Details */}
                {isExpanded && (
                  <div style={{
                    padding: '12px 14px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Transaction Details section */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <FaReceipt size={10} /> Transaction Details
                        </div>
                        {payment.receipt_url && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); window.open(payment.receipt_url, '_blank'); }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)',
                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                              borderRadius: 0,
                              fontSize: 9,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <FaReceipt size={9} />
                            Receipt
                            <FaChevronRight size={9} style={{ opacity: 0.7 }} />
                          </button>
                        )}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: 10,
                        padding: '10px 14px',
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                        borderRadius: 6,
                        marginBottom: 10,
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Amount</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: colours.highlight }}>
                            £{Number(payment.amount || 0).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', alignSelf: 'stretch' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Service</span>
                          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                            {serviceLabel}
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* Bank Payment Confirmation - for bank transfers without a confirmed date */}
                    {isBank && !isSuccess && onConfirmBankPayment && (
                      <BankPaymentConfirmation
                        paymentId={paymentId}
                        isDarkMode={isDarkMode}
                        onConfirm={onConfirmBankPayment}
                      />
                    )}

                  </div>
                )}
              </div>
            );
          })}
          </>
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
        background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
        borderBottom: 'none',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 0,
        fontFamily: 'Raleway, sans-serif',
        position: 'relative',
        zIndex: 5,
        pointerEvents: 'auto',
        boxShadow: isDarkMode ? '0 12px 28px rgba(0,0,0,0.35)' : '0 10px 24px rgba(15,23,42,0.08)',
      }}
    >
      {/* Pipeline Tabs - Instructed → ID → Pay → Risk → Matter → Docs */}
      {pipelineStages.length > 0 && (
      <div 
        data-action-button="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          background: isDarkMode ? 'rgba(11, 18, 32, 0.65)' : 'rgba(255, 255, 255, 0.8)',
          position: 'relative',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
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
              ? '#22c55e'  // Green when previous stage is complete
              : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'); // Gray otherwise

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

            return (
              <React.Fragment key={stage.key}>
                {/* Connector line - lights up green when previous stage is complete */}
                {idx > 0 && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      height: 1.5,
                      width: 10,
                      background: isConnectorLit 
                        ? 'rgba(34, 197, 94, 0.7)'
                        : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'),
                      borderRadius: 1,
                      margin: '0 2px',
                    }} />
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={handleClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: '16px',
                    background: isActive 
                      ? 'rgba(125, 211, 252, 0.12)' 
                      : (isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'),
                    border: isActive 
                      ? '1px solid rgba(125, 211, 252, 0.45)' 
                      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: 'none',
                    color: statusColors.text,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 600,
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap' as const,
                    position: 'relative',
                    zIndex: isActive ? 10 : 1,
                    opacity: stage.status === 'pending' || stage.status === 'neutral' ? 0.7 : 1,
                  }}
                  title={stage.date ? `${stage.label}: ${stage.date}` : stage.label}
                >
                  <span style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    color: statusColors.text, 
                    opacity: isActive ? 1 : 0.9,
                  }}>
                    {stage.icon}
                  </span>
                  
                  <span>{stage.label}</span>

                  {/* Status Badges / Checks */}
                  {(stage as any).count !== undefined && (stage as any).count > 0 ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.18)',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                      marginLeft: 2,
                    }}>
                      {(stage as any).count}
                    </span>
                  ) : stage.isComplete ? (
                    <FaCheck size={9} style={{ 
                      color: '#22c55e', 
                      marginLeft: 2,
                    }} />
                  ) : stage.hasIssue ? (
                    <FaExclamationTriangle size={9} style={{ 
                      color: '#ef4444', 
                      marginLeft: 2 
                    }} />
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
        padding: '18px 20px 20px 20px',
        minHeight: 96,
        border: `1px solid ${isTabbedContent ? activeTabPalette.border : (isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.12)')}`,
        borderTop: isTabbedContent ? `1px solid ${activeTabPalette.border}` : (isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.12)'),
        borderRadius: 4,
        marginTop: -1,
        marginBottom: 0,
        boxShadow: 'none',
        transform: isTabbedContent ? 'translateY(0)' : 'translateY(-1px)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
      }}>
        {/* Details Tab - Client/Entity information landing page */}
        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(() => {
              // Respect activeContextStage even if chips are hidden
              const contextStage: ContextStageKey = activeContextStage ?? 'enquiry';

              return (
                <>
                  {/* Client Type Banner - Prominent cue for company vs individual */}
                  {isCompany && (
                    <div style={{
                      padding: '8px 14px',
                      background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                      borderRadius: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <FaBuilding size={12} color={colours.highlight} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: colours.highlight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Company Client
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)', marginLeft: 4 }}>
                        {companyName !== '—' ? companyName : ''}
                        {companyNo !== '—' && <span style={{ fontFamily: 'monospace', marginLeft: 6, opacity: 0.7 }}>({companyNo})</span>}
                      </span>
                    </div>
                  )}

                  {/* Client/Entity Header Card */}
                  <div style={{
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                    borderRadius: 0,
                    padding: '12px 14px',
                  }}>


                    {/* Meta tags (match enquiry table/overview look & feel) */}
                    <div>
                      {(() => {
                        const tagBase: React.CSSProperties = {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)'}`,
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(15, 23, 42, 0.02)',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.72)',
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
                          if (a.includes('commercial')) return 'rgb(54, 144, 206)';
                          if (a.includes('construction')) return 'rgb(240, 124, 80)';
                          if (a.includes('property')) return 'rgb(115, 171, 96)';
                          if (a.includes('employment')) return 'rgb(214, 176, 70)';
                          return 'rgb(214, 85, 65)';
                        };

                        const getAreaOfWorkIcon = (raw: any): string => {
                          const a = String(raw ?? '').toLowerCase().trim();
                          if (a.includes('triage')) return '🩺';
                          if (a.includes('construction') || a.includes('building')) return '🏗️';
                          if (a.includes('property') || a.includes('real estate') || a.includes('conveyancing')) return '🏠';
                          if (a.includes('commercial') || a.includes('business')) return '🏢';
                          if (a.includes('employment') || a.includes('hr') || a.includes('workplace')) return '👩🏻‍💼';
                          if (a.includes('allocation')) return '📂';
                          return 'ℹ️';
                        };

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
                          const ratingColor = enquiryRating === 'Good' ? '#22c55e' : enquiryRating === 'Poor' ? '#ef4444' : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b');
                          
                          // Claim timestamp for new space enquiries (from enquiry record or enrichment data)
                          const claimTimestampRaw = getValue(['claim', 'Claim', 'ClaimTimestamp', 'claim_timestamp', 'AllocatedAt', 'allocated_at', 'ClaimedAt', 'claimed_at']);
                          
                          // Teams timestamp from enrichment data (same source as prospects table uses)
                          const teamsTimestampRaw = enrichmentTeamsData?.MessageTimestamp 
                            || enrichmentTeamsData?.CreatedAt 
                            || (enrichmentTeamsData?.CreatedAtMs ? new Date(enrichmentTeamsData.CreatedAtMs).toISOString() : null);
                          
                          // Prefer Teams timestamp from enrichment, fall back to claim timestamp
                          const teamsTime = (() => {
                            const raw = teamsTimestampRaw || (claimTimestampRaw !== '—' ? claimTimestampRaw : null);
                            if (!raw) return null;
                            try {
                              const d = new Date(raw);
                              if (Number.isNaN(d.getTime())) return null;
                              return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                            } catch { return null; }
                          })();
                          
                          // Teams link from enrichment data or resolved via API
                          const effectiveTeamsLink = enrichmentTeamsData?.teamsLink || teamsCardLink || null;
                          
                          // Teams chip shows if we have enrichment data, teamsCardLink, teamsIdentifier (can fetch), or claim time
                          const hasTeamsData = Boolean(enrichmentTeamsData || teamsCardLink || teamsIdentifier || teamsTime || isDemoInstruction);

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                              
                              {/* Row 1: Integration Chips + Timestamp */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {/* ActiveCampaign Chip */}
                                  {acContactId && (
                                    <a 
                                      href={`https://helixlaw.activehosted.com/app/contacts/${acContactId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Open ActiveCampaign Contact ${acContactId}`}
                                      style={{ 
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '5px 10px', borderRadius: 4,
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                                        textDecoration: 'none',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <img src={activecampaignIcon} alt="AC" title="ActiveCampaign" style={{ width: 12, height: 12, filter: activeCampaignBlueFilter }} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight, fontFamily: 'monospace' }}>{acContactId}</span>
                                    </a>
                                  )}
                                  
                                  {/* Teams Chip - blue styling like AC chip */}
                                  {hasTeamsData && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (effectiveTeamsLink) {
                                          window.open(effectiveTeamsLink, '_blank');
                                        } else if (teamsIdentifier && !teamsCardLink) {
                                          // Trigger fetch if we have identifier but no link yet
                                          void resolveTeamsCardLink();
                                        }
                                      }}
                                      title={effectiveTeamsLink ? 'Open Teams Card' : 'Teams activity tracked'}
                                      style={{ 
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '5px 10px', borderRadius: 4,
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                                        textDecoration: 'none',
                                        cursor: effectiveTeamsLink ? 'pointer' : 'default',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 12, color: colours.highlight } }} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>
                                        {teamsTime ? `Claimed ${teamsTime}` : 'Teams'}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* Rating inline - clickable if unrated */}
                                  <div 
                                    onClick={() => {
                                      if (!enquiryRating || enquiryRating === '—') {
                                        const enquiryId = enquiry?.ID || enquiry?.id;
                                        if (enquiryId) {
                                          window.dispatchEvent(new CustomEvent('helix:rate-enquiry', { detail: { enquiryId: String(enquiryId) } }));
                                        }
                                      }
                                    }}
                                    title={!enquiryRating || enquiryRating === '—' ? 'Click to rate this enquiry' : `Rated: ${enquiryRating}`}
                                    style={{ 
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 4,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                                      cursor: (!enquiryRating || enquiryRating === '—') ? 'pointer' : 'default',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Icon iconName={enquiryRating === 'Good' ? 'Like' : enquiryRating === 'Poor' ? 'Dislike' : 'FavoriteStar'} styles={{ root: { fontSize: 11, color: ratingColor } }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: ratingColor }}>{enquiryRating || 'Rate'}</span>
                                  </div>
                                </div>
                                
                                {/* Timestamp */}
                                <div style={{ 
                                  display: 'flex', alignItems: 'center', gap: 6, 
                                  fontSize: 11, 
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : '#475569',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)',
                                  padding: '4px 10px',
                                  borderRadius: 4
                                }}>
                                  <FaClock size={10} />
                                  <span style={{ fontWeight: 600 }}>{submissionDate}</span>
                                </div>
                              </div>

                              {/* Row 2: Key Info Strip */}
                              <div style={{ 
                                display: 'flex', flexWrap: 'wrap', gap: 0, 
                                padding: '10px 0',
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                                borderRadius: 6,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                              }}>
                                {/* Area with icon */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Area</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                                    <span style={{ fontSize: 14 }}>{getAreaOfWorkIcon(areaOfWork)}</span>
                                    {areaOfWork || '—'}
                                  </span>
                                </div>
                                
                                {/* Type */}
                                {isMeaningful(typeOfWork) && (
                                  <>
                                    <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Type</span>
                                      <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{typeOfWork}</span>
                                    </div>
                                  </>
                                )}
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* POC */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Claimed By</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: pointOfContact ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {pointOfContact || 'Unclaimed'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Value - always show */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Value</span>
                                  <span style={{ fontSize: 12, fontWeight: isMeaningful(enquiryValue) ? 600 : 400, color: isMeaningful(enquiryValue) ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {isMeaningful(enquiryValue) ? enquiryValue : '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Method - always show */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Method</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: isMeaningful(methodOfContact) ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {isMeaningful(methodOfContact) ? methodOfContact : '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Source - always show */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Source</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isMeaningful(enquirySourceSummary) ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {isMeaningful(enquirySourceSummary) ? enquirySourceSummary : '—'}
                                  </span>
                                </div>
                              </div>

                              {/* Row 3: Notes */}
                              {hasEnquiryNotes && (
                                <div style={{
                                  padding: '12px 14px',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#fff',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`,
                                  borderRadius: 6,
                                  fontSize: 12,
                                  lineHeight: 1.65,
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#334155',
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: 180,
                                  overflowY: 'auto'
                                }}>
                                  {enquiryNotes}
                                </div>
                              )}
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
                          const pitchedBy = effectivePitch?.CreatedBy || effectivePitch?.createdBy || deal?.PitchedBy || deal?.pitchedBy || pointOfContact || '';
                          const pitchStatus = deal?.Status || deal?.status || effectivePitch?.Status || effectivePitch?.status || '';
                          const pitchExpiryRaw = deal?.PitchValidUntil || deal?.pitchValidUntil || effectivePitch?.PitchValidUntil || effectivePitch?.pitchValidUntil || null;
                          const pitchExpiry = pitchExpiryRaw ? formatDate(pitchExpiryRaw) : null;
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
                          
                          // Check if we have any pitch data at all
                          const hasNoPitchData = !deal && !effectivePitch && !isFetchingPitchContent;
                          
                          // Combine PitchedDate and PitchedTime for accurate datetime
                          const pitchedDateTime = (() => {
                            const dateRaw = deal?.PitchedDate || deal?.pitchedDate || effectivePitch?.CreatedAt || effectivePitch?.createdAt;
                            const timeRaw = deal?.PitchedTime || deal?.pitchedTime;
                            if (!dateRaw) return null;
                            try {
                              const d = new Date(dateRaw);
                              if (Number.isNaN(d.getTime())) return null;
                              // If we have a separate time field, extract HH:MM from it
                              if (timeRaw) {
                                const t = new Date(timeRaw);
                                if (!Number.isNaN(t.getTime())) {
                                  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                                }
                              }
                              const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                              const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                              return `${date} ${time}`;
                            } catch { return null; }
                          })();
                          
                          // Show loading state while fetching pitch content
                          if (isFetchingPitchContent) {
                            return (
                              <div style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                padding: '24px', 
                                color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                                fontSize: 12 
                              }}>
                                Loading pitch data...
                              </div>
                            );
                          }
                          
                          // Show empty state if no pitch data
                          if (hasNoPitchData) {
                            return (
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                padding: '24px 16px', gap: 8,
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(0,0,0,0.02)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.04)'}`,
                                borderRadius: 6
                              }}>
                                <FaUser size={16} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)' }} />
                                <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)' }}>
                                  No pitch recorded
                                </div>
                                <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>
                                  Use the Pitch Builder to create a pitch for this enquiry
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                              
                              {/* Row 1: Pitched Badge + Timestamp */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {/* Pitched Badge - styled like Teams claimed badge */}
                                  <div
                                    title="Pitch sent"
                                    style={{ 
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '5px 10px', borderRadius: 4,
                                      background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                                      textDecoration: 'none',
                                      cursor: 'default',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Icon iconName="Send" styles={{ root: { fontSize: 11, color: colours.highlight } }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>
                                      {pitchedDateTime ? `Pitched ${pitchedDateTime}` : 'Pitched'}
                                    </span>
                                  </div>
                                  
                                  {/* Passcode chip - clickable to copy */}
                                  {dealPasscode && (
                                    <div
                                      onClick={(e) => { e.stopPropagation(); void safeCopy(String(dealPasscode)); }}
                                      title="Click to copy passcode"
                                      style={{ 
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '5px 10px', borderRadius: 4,
                                        background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <Icon iconName="NumberSymbol" styles={{ root: { fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' } }} />
                                      <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{dealPasscode}</span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Timestamp */}
                                <div style={{ 
                                  display: 'flex', alignItems: 'center', gap: 6, 
                                  fontSize: 11, 
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : '#475569',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)',
                                  padding: '4px 10px',
                                  borderRadius: 4
                                }}>
                                  <FaClock size={10} />
                                  <span style={{ fontWeight: 600 }}>{pitchDate}</span>
                                </div>
                              </div>

                              {/* Row 2: Key Info Strip - matches enquiry design */}
                              <div style={{ 
                                display: 'flex', flexWrap: 'wrap', gap: 0, 
                                padding: '10px 0',
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                                borderRadius: 6,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                              }}>  
                                {/* Pitched To (prospect name - first item) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Pitched To</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', color: fullName !== '—' && fullName !== 'Unknown' ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {fullName !== 'Unknown' ? fullName : '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Area with icon */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Area</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, lineHeight: '18px', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                                    <span style={{ fontSize: 14, lineHeight: 1 }}>{getAreaOfWorkIcon(areaOfWork)}</span>
                                    {areaOfWork || '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Pitched By */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Pitched By</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', color: pitchedBy ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {pitchedBy || '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Status */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Status</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', textTransform: 'capitalize', color: pitchStatus ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {pitchStatus || '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Expiry */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Valid Until</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px', color: pitchExpiry ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {pitchExpiry || '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Deal ID */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Deal</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', lineHeight: '18px', color: dealId ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {dealId || '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                
                                {/* Instruction Ref */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Ref</span>
                                  <span 
                                    onClick={pitchInstructionRef ? (e) => { e.stopPropagation(); void safeCopy(String(pitchInstructionRef)); } : undefined}
                                    style={{ 
                                      fontSize: 12, fontWeight: 500, fontFamily: 'monospace', lineHeight: '18px',
                                      color: pitchInstructionRef ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8'),
                                      cursor: pitchInstructionRef ? 'pointer' : 'default'
                                    }}
                                  >
                                    {pitchInstructionRef || '—'}
                                  </span>
                                </div>
                              </div>

                              {/* Row 3: Amount and Service side by side */}
                              <div style={{
                                display: 'flex', alignItems: 'stretch', gap: 10,
                                padding: '10px 14px',
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                                borderRadius: 6
                              }}>
                                {/* Amount - fixed width */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Amount</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: dealAmount ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {dealAmount ? formatMoney(dealAmount) : '—'}
                                  </span>
                                </div>
                                
                                {/* Separator */}
                                <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', alignSelf: 'stretch' }} />
                                
                                {/* Service - takes remaining space */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Service</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: dealScenario ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {dealScenario || '—'}
                                  </span>
                                </div>
                              </div>

                              {/* Row 4: Pitch content preview */}
                              {hasPitchContent && (() => {
                                const needsExpansion = cleanEmailBody && cleanEmailBody.length > 300;
                                const displayBody = isPitchContentExpanded || !needsExpansion
                                  ? cleanEmailBody
                                  : `${cleanEmailBody.slice(0, 300)}...`;
                                return (
                                  <div style={{
                                    padding: '12px 14px',
                                    background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#fff',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`,
                                    borderRadius: 6,
                                    fontSize: 12,
                                    lineHeight: 1.65,
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#334155',
                                    whiteSpace: 'pre-wrap',
                                    ...(!isPitchContentExpanded && { maxHeight: 180, overflowY: 'auto' as const })
                                  }}>
                                    {pitchEmailSubject && (
                                      <div style={{ fontWeight: 600, marginBottom: cleanEmailBody ? 8 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <FaEnvelope size={10} style={{ opacity: 0.6 }} />
                                        {pitchEmailSubject}
                                      </div>
                                    )}
                                    {cleanEmailBody && (
                                      <div style={{ opacity: 0.85 }}>
                                        {displayBody}
                                      </div>
                                    )}
                                    {needsExpansion && (
                                      <div
                                        onClick={(e) => { e.stopPropagation(); setIsPitchContentExpanded(prev => !prev); }}
                                        style={{
                                          marginTop: 8,
                                          fontSize: 11,
                                          fontWeight: 500,
                                          color: colours.highlight,
                                          cursor: 'pointer',
                                          display: 'inline-block'
                                        }}
                                      >
                                        {isPitchContentExpanded ? 'Show less' : 'Show more'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
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
                        const instGender = String(inst?.Gender ?? inst?.gender ?? gender ?? '').trim();
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
                        ].filter(v => v && v !== '—');
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
                        ].filter(v => v && v !== '—');
                        const instCompanyFullAddress = instCompanyAddressParts.join(', ') || '—';
                        const hasCompanyDetails = (instCompanyName && instCompanyName !== '—') || (instCompanyNumber && instCompanyNumber !== '—');
                        
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
                            const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeRaw = inst?.SubmissionTime || inst?.submissionTime || inst?.CreatedTime || inst?.createdTime || null;
                            if (timeRaw) {
                              const t = new Date(timeRaw);
                              if (!Number.isNaN(t.getTime())) {
                                const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                return `${date} ${time}`;
                              }
                            }
                            return date;
                          } catch {
                            return null;
                          }
                        })();
                        
                        // Determine instruction status label
                        const instStatusLabel = (() => {
                          const stage = instructionStage.toLowerCase();
                          if (hasMatter && matterRef && matterRef !== '—') return 'Matter Created';
                          if (stage.includes('complet')) return 'Completed';
                          if (stage.includes('active') || stage.includes('progress')) return 'In Progress';
                          if (stage.includes('initiali')) return 'Initialised';
                          if (stage.includes('instruct')) return 'Instructed';
                          return matterStatus !== '—' ? matterStatus : 'Instructed';
                        })();
                        
                        // Status color based on stage
                        const instStatusColor = (() => {
                          if (hasMatter) return '#22c55e'; // Green for matter created
                          if (instructionStage.toLowerCase().includes('complet')) return '#22c55e';
                          if (instructionStage.toLowerCase().includes('active') || instructionStage.toLowerCase().includes('progress')) return colours.highlight;
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

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                              
                            {/* Row 1: Instructed Timestamp + Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {/* Instructed Timestamp chip - at the start */}
                              {instructionDateTime && (
                                <div
                                  title="Instruction date"
                                  style={{ 
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '5px 10px', borderRadius: 4,
                                    background: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.15)'}`,
                                    cursor: 'default',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <FaClock size={10} style={{ color: '#22c55e' }} />
                                  <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e' }}>Instructed {instructionDateTime}</span>
                                </div>
                              )}
                                
                              {/* Instruction Ref chip - clickable to copy */}
                                {instructionRef && (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); void safeCopy(String(instructionRef)); }}
                                    title="Click to copy instruction reference"
                                    style={{ 
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 4,
                                      background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Icon iconName="Tag" styles={{ root: { fontSize: 10, color: colours.highlight } }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: colours.highlight }}>{instructionRef}</span>
                                  </div>
                                )}
                                
                                {/* Instruct Link chip - opens pitch page */}
                                {checkoutUrl && instPasscode && (
                                  <a
                                    href={checkoutUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Open instruct page: instruct.helix-law.com/pitch/${instPasscode}`}
                                    style={{ 
                                      display: 'flex', alignItems: 'center', gap: 5,
                                      padding: '5px 10px', borderRadius: 4,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                                      cursor: 'pointer',
                                      textDecoration: 'none',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <FaLink size={9} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' }} />
                                    <span style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : '#64748b' }}>Instruct Link</span>
                                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{instPasscode}</span>
                                  </a>
                                )}
                            </div>

                            {/* Row 2: Key Info Strip */}
                            <div style={{ 
                              display: 'flex', flexWrap: 'wrap', gap: 0, 
                              padding: '10px 0',
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                              borderRadius: 6,
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                            }}>
                              {/* Client Type */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Type</span>
                                <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, color: clientType && clientType !== '—' ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                  {clientType && clientType !== '—' && (clientType.toLowerCase().includes('company') || clientType.toLowerCase().includes('business') || clientType.toLowerCase().includes('corporate')) 
                                    ? <FaBuilding size={10} style={{ opacity: 0.7 }} />
                                    : <FaUser size={10} style={{ opacity: 0.7 }} />}
                                  {clientType || '—'}
                                </span>
                              </div>
                              
                              {/* Separator */}
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                              {/* Client - shows Company Name for Company clients, Person Name for Individual */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Client</span>
                                <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                                  {clientType && (clientType.toLowerCase().includes('company') || clientType.toLowerCase().includes('business') || clientType.toLowerCase().includes('corporate'))
                                    ? <><FaBuilding size={10} style={{ opacity: 0.7 }} />{instCompanyName || instFullName || '—'}</>
                                    : <><FaUser size={10} style={{ opacity: 0.7 }} />{instFullName || '—'}</>
                                  }
                                </span>
                              </div>
                              
                              {/* Separator */}
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                              {/* Fee Earner / Helix Contact */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Helix Contact</span>
                                <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', color: feeEarner && feeEarner !== '—' ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                  {feeEarner || '—'}
                                </span>
                              </div>
                              
                              {/* Separator */}
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                              
                              {/* Stage */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Stage</span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: instructionStage ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                  {instructionStage || matterStatus || '—'}
                                </span>
                              </div>
                              
                              {/* Separator */}
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                              {/* Payment Status */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Payment</span>
                                <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, color: instPaymentStatus === 'Paid' ? '#22c55e' : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                  {instPaymentStatus === 'Paid' && (
                                    instPaymentIsCard ? <FaCreditCard size={10} style={{ opacity: 0.8 }} /> 
                                    : instPaymentIsBank ? <FaBuilding size={10} style={{ opacity: 0.8 }} /> 
                                    : null
                                  )}
                                  {instPaymentStatus === 'Paid' && instPaymentDate ? `Paid ${instPaymentDate}` : instPaymentStatus}
                                </span>
                              </div>
                              
                              {/* Separator */}
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                              {/* Consent */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Consent</span>
                                <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, color: '#22c55e' }}>
                                  <FaCheck size={9} />
                                  Given
                                </span>
                              </div>

                              {instLastUpdated && (
                                <>
                                  {/* Separator */}
                                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                                  {/* Last Updated */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Updated</span>
                                    <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                                      {instLastUpdated}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Row 3: Identity */}
                            <div style={{
                              padding: '12px 14px',
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                              borderRadius: 6
                            }}>
                              <div style={{ fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                                <FaIdCard size={10} style={{ opacity: 0.6 }} />
                                Identity
                              </div>
                              
                              {/* Personal info grid */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: hasIndividualAddress ? 12 : 0 }}>
                                {/* DOB */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>DOB</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: instDob && instDob !== '—' ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {instDob || '—'}{instAge && instAge !== '—' ? ` (${instAge})` : ''}
                                  </span>
                                </div>
                                
                                {/* Gender */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 60 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Gender</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: instGender ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {instGender || '—'}
                                  </span>
                                </div>
                                
                                {/* Nationality */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Nationality</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: instNationality ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {instNationality || '—'}
                                  </span>
                                </div>
                                
                                {/* ID Type */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>ID Type</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4, color: instIdType ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                                    {instIdType === 'passport' ? <FaPassport size={10} style={{ opacity: 0.6 }} /> : null}
                                    {instIdType || '—'}
                                  </span>
                                </div>
                                
                                {/* ID Number (passport or license based on ID Type) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                                    {instIdType?.toLowerCase().includes('license') || instIdType?.toLowerCase().includes('licence') ? 'License No.' : 'Passport No.'}
                                  </span>
                                  <span 
                                    onClick={(instPassportNumber || instDriversLicense) ? (e) => { e.stopPropagation(); void safeCopy(instIdType?.toLowerCase().includes('licen') ? instDriversLicense : instPassportNumber || instDriversLicense); } : undefined}
                                    style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: (instPassportNumber || instDriversLicense) ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8'), cursor: (instPassportNumber || instDriversLicense) ? 'pointer' : 'default' }}>
                                    {instIdType?.toLowerCase().includes('licen') ? (instDriversLicense || '—') : (instPassportNumber || '—')}
                                  </span>
                                </div>
                                
                                {/* Related Client ID */}
                                {instRelatedClientId && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
                                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Related Client</span>
                                    <span 
                                      onClick={(e) => { e.stopPropagation(); void safeCopy(String(instRelatedClientId)); }}
                                      style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: 'pointer' }}>
                                      {instRelatedClientId}
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Address (labeled, inside box) */}
                              {hasIndividualAddress && (
                                <div style={{ 
                                  paddingTop: 10, 
                                  borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                                    <FaHome size={10} style={{ opacity: 0.6 }} />
                                    Address
                                  </div>
                                  <span 
                                    onClick={(e) => { e.stopPropagation(); void safeCopy(instFullAddress); }}
                                    style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: 'pointer', lineHeight: 1.5 }}>
                                    {instFullAddress}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Row 6: Company Details */}
                            {hasCompanyDetails && (
                              <div style={{
                                padding: '12px 14px',
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                                borderRadius: 6
                              }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                                  <FaBuilding size={10} style={{ opacity: 0.6 }} />
                                  Company
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                                  {instCompanyName && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Name</span>
                                      <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{instCompanyName}</span>
                                    </div>
                                  )}
                                  {instCompanyNumber && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Company No.</span>
                                      <span 
                                        onClick={(e) => { e.stopPropagation(); void safeCopy(instCompanyNumber); }}
                                        style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: 'pointer' }}>{instCompanyNumber}</span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Company Address (labeled, inside box like individual address) */}
                                {instCompanyAddressParts.length > 0 && (
                                  <div style={{ 
                                    paddingTop: 10, 
                                    marginTop: 10,
                                    borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`
                                  }}>
                                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                      <FaBuilding size={9} style={{ opacity: 0.6 }} />
                                      Address
                                    </span>
                                    <div 
                                      onClick={(e) => { e.stopPropagation(); void safeCopy(instCompanyFullAddress); }}
                                      style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: 'pointer', lineHeight: 1.5 }}>
                                      {instCompanyFullAddress}
                                      {instCompanyCountryCode && instCompanyCountryCode !== instCompanyCountry && <span style={{ marginLeft: 6, fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#94a3b8' }}>({instCompanyCountryCode})</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Row 7: Instruction notes (if provided) */}
                            {instNotes && (
                              <div style={{
                                padding: '12px 14px',
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#fff',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`,
                                borderRadius: 6,
                                fontSize: 12,
                                lineHeight: 1.65,
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#334155',
                                whiteSpace: 'pre-wrap'
                              }}>
                                <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : '#64748b' }}>
                                  <FaFileAlt size={10} style={{ opacity: 0.6 }} />
                                  Instruction notes
                                </div>
                                <div style={{ opacity: 0.95 }}>
                                  {instNotes}
                                </div>
                              </div>
                            )}
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
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          }}
                          title={isEnquiryNotesExpanded ? 'Collapse notes' : 'Show notes'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 0,
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
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
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                                  lineHeight: 1,
                                }}
                              >
                                Notes
                              </div>
                              {!isEnquiryNotesExpanded && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.55)',
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
              identityStatus === 'complete' 
                ? (isManuallyApproved ? 'ID Approved' : 'ID Verified')
                : identityStatus === 'review' ? 'ID Needs Review' : 'ID Pending',
              identityStatus,
              identityStatus === 'complete'
                ? (isManuallyApproved && hasUnderlyingIssues 
                    ? 'Manually approved despite individual check issues (see below).'
                    : 'ID verification completed.')
                : identityStatus === 'review'
                  ? 'Review and approve ID or request further documents.'
                  : 'Run ID verification to proceed.',
              identityStatus === 'complete' ? <FaCheckCircle size={12} /> : identityStatus === 'review' ? <FaExclamationTriangle size={12} /> : <FaIdCard size={12} />,
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

            {/* ID Verification Section */}
            <div style={{
              padding: '12px 14px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
              borderRadius: 6
            }}>
              {/* Header */}
              <div style={{ fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                <FaIdCard size={10} style={{ opacity: 0.6 }} />
                ID Verification
              </div>

              {/* Data bar - Check metadata (only when verification has run) */}
              {eidStatus !== 'pending' && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0,
                  padding: '10px 0',
                  background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                  borderRadius: 6,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                  marginBottom: 12
                }}>
                  {/* Checked Date */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Checked</span>
                    <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                      {formatMaybeDate(verificationDetails?.checkedDate) || verificationDetails?.checkedDate || eidDate || '—'}
                    </span>
                  </div>
                  
                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                  
                  {/* Document Type */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                      Document
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: (passport !== '—' || license !== '—') ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                      {passport !== '—' ? 'Passport' : license !== '—' ? 'Driving License' : '—'}
                    </span>
                  </div>
                  
                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                  
                  {/* Provider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Provider</span>
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: verificationMeta.provider !== '—' ? 'pointer' : 'default' }}
                      onClick={(e) => { if (verificationMeta.provider === '—') return; e.stopPropagation(); void safeCopy(verificationMeta.provider); }}
                      title={verificationMeta.provider !== '—' ? 'Click to copy' : undefined}
                    >
                      {verificationMeta.provider || '—'}
                    </span>
                  </div>
                  
                  {/* Ref */}
                  {verificationMeta.correlationId !== '—' && (
                    <>
                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Ref</span>
                        <span
                          style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b', cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                      borderRadius: 4,
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
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                        lineHeight: 1
                      }}>
                        Verification Data
                      </div>
                      {!isVerificationDataExpanded && (
                        <div style={{
                          fontSize: 10,
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.55)',
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
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
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
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                      marginTop: 8
                    }}>
                      {/* Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Name</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>
                          {[title, firstName, lastName].filter(Boolean).join(' ') || '—'}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                      {/* Document Number */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                          {passport !== '—' ? 'Passport' : license !== '—' ? 'License' : 'Doc No.'}
                        </span>
                        <span 
                          onClick={(passport !== '—' || license !== '—') ? (e) => { e.stopPropagation(); void safeCopy(passport !== '—' ? passport : license); } : undefined}
                          title={(passport !== '—' || license !== '—') ? 'Click to copy' : undefined}
                          style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: (passport !== '—' || license !== '—') ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8'), cursor: (passport !== '—' || license !== '—') ? 'pointer' : 'default' }}>
                          {(passport !== '—' ? passport : license !== '—' ? license : '—')}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                      {/* DOB */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>DOB</span>
                        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: dob !== '—' ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                          {dob}{age !== '—' ? ` (${age})` : ''}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                      {/* Nationality */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Nationality</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: nationalityAlpha !== '—' ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8') }}>
                          {nationalityAlpha}
                        </span>
                      </div>

                      {/* Separator */}
                      <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                      {/* Address (if available) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px', flex: 1, minWidth: 200 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Address</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: address ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                {/* EID Results Strip - unified layout like Key Info Strip */}
                <div style={{ 
                  display: 'flex', flexWrap: 'wrap', gap: 0, 
                  padding: '10px 0',
                  background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                  borderRadius: 6,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                }}>
                  {/* EID Label with badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <FaShieldAlt size={9} style={{ opacity: 0.6 }} /> EID
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: isManuallyApproved ? '#f59e0b' : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b') }}>
                      {isManuallyApproved ? 'Manually Approved' : 'Checked'}
                    </span>
                  </div>

                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                  {/* Overall */}
                  {(() => {
                    const overallValue = isManuallyApproved ? 'Approved' : (eidResult && eidResult !== '—' ? eidResult : (verificationDetails?.overallResult || '—'));
                    const isPass = overallValue.toLowerCase().includes('pass') || overallValue.toLowerCase().includes('clear') || overallValue.toLowerCase() === 'approved';
                    const isWarn = overallValue.toLowerCase().includes('review') || overallValue.toLowerCase().includes('refer');
                    const isFail = overallValue.toLowerCase().includes('fail');
                    const resultColor = isPass ? '#22c55e' : (isFail || isWarn) ? colours.cta : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b');
                    const isOverallNeedsAction = isFail || isWarn;
                    return (
                      <div 
                        onClick={isOverallNeedsAction ? () => setShowEidActionModal(true) : undefined}
                        style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px', cursor: isOverallNeedsAction ? 'pointer' : 'default' }}
                        title={isOverallNeedsAction ? 'Click to review' : undefined}
                      >
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Overall</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: resultColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isPass ? <FaCheckCircle size={10} style={{ opacity: 0.8 }} /> : (isFail || isWarn) ? <FaExclamationTriangle size={10} style={{ opacity: 0.8 }} /> : null}
                          {overallValue}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                  {/* PEP/Sanctions */}
                  {(() => {
                    const pepValue = pepResult && pepResult !== '—' ? pepResult : (verificationDetails?.pepResult || '—');
                    const isPass = pepValue.toLowerCase().includes('pass') || pepValue.toLowerCase().includes('clear') || pepValue.toLowerCase().includes('no match');
                    const isWarn = pepValue.toLowerCase().includes('review') || pepValue.toLowerCase().includes('refer');
                    const isFail = pepValue.toLowerCase().includes('fail') || pepValue.toLowerCase().includes('match');
                    const resultColor = isPass ? '#22c55e' : (isFail || isWarn) ? colours.cta : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b');
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>PEP/Sanctions</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: resultColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isPass ? <FaCheckCircle size={10} style={{ opacity: 0.8 }} /> : (isFail || isWarn) ? <FaExclamationTriangle size={10} style={{ opacity: 0.8 }} /> : null}
                          {pepValue}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                  {/* Address */}
                  {(() => {
                    const addrValue = addressVerification && addressVerification !== '—' ? addressVerification : (verificationDetails?.addressResult || '—');
                    const isPass = addrValue.toLowerCase().includes('pass') || addrValue.toLowerCase().includes('verified');
                    const isWarn = addrValue.toLowerCase().includes('review') || addrValue.toLowerCase().includes('refer');
                    const isFail = addrValue.toLowerCase().includes('fail');
                    const resultColor = isPass ? '#22c55e' : (isFail || isWarn) ? colours.cta : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b');
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Address</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: resultColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isPass ? <FaCheckCircle size={10} style={{ opacity: 0.8 }} /> : (isFail || isWarn) ? <FaExclamationTriangle size={10} style={{ opacity: 0.8 }} /> : null}
                          {addrValue}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Separator */}
                  <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />

                  {/* Raw Record Toggle */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Raw Record</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); setIsRawRecordExpanded((v) => !v); }}
                      style={{ fontSize: 12, fontWeight: 500, color: isRawRecordExpanded ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b'), cursor: 'pointer' }}
                    >
                      {isRawRecordExpanded ? 'Hide' : 'Show'}
                    </span>
                  </div>
                </div>

                {/* Raw Record Expanded (directly below the strip) */}
                {isRawRecordExpanded && (
                  <div style={{
                    padding: '8px 10px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.75)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                    borderRadius: 4,
                  }}>
                    <pre style={{
                      margin: 0,
                      fontSize: 10,
                      lineHeight: 1.45,
                      fontFamily: 'monospace',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.72)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 260,
                      overflow: 'auto',
                    }}>
                      {(() => {
                        const raw = verificationDetails?.rawResponse || (item as any)?.instruction?.EID_Result;
                        if (!raw) return 'No raw record available.';
                        const parsed = parseRawResponse(raw);
                        if (parsed && typeof parsed === 'object') {
                          try { return JSON.stringify(parsed, null, 2); } catch { return String(raw ?? ''); }
                        }
                        return typeof raw === 'string' ? raw : String(raw ?? '');
                      })()}
                    </pre>
                  </div>
                )}

                {/* Expanded details - additional refs */}
                {isEidDetailsExpanded && (
                  <div style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    {isVerificationDetailsLoading && (
                      <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.65)' }}>
                        Loading verification details…
                      </div>
                    )}

                    {!isVerificationDetailsLoading && verificationDetailsError && (
                      <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>{verificationDetailsError}</div>
                    )}

                    {!isVerificationDetailsLoading && !verificationDetailsError && !verificationDetails && (
                      <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.65)' }}>
                        No verification details available.
                      </div>
                    )}

                    {verificationDetails && (
                      <>
                    {/* Additional reference IDs */}
                    {verificationMeta.references.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Additional References
                        </div>
                        {verificationMeta.references.slice(0, 3).map((ref) => (
                          <div key={ref.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 6, alignItems: 'baseline' }}>
                            <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', textAlign: 'left' }}>{ref.label}</div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)',
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

                    {/* EID Action Picker Modal — portalled to body */}
                    {showEidActionModal && createPortal(
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
                        onClick={() => setShowEidActionModal(false)}
                      >
                        <div
                          style={{
                            background: isDarkMode ? '#1e293b' : '#ffffff',
                            borderRadius: 8,
                            padding: 20,
                            maxWidth: 380,
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FaExclamationTriangle size={16} color="#ef4444" />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>EID Needs Review</div>
                              <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>Choose an action</div>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, lineHeight: 1.5, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', marginBottom: 16 }}>
                            The electronic ID check flagged issues. You can either approve the verification (if the result is acceptable) or request additional documents from the client.
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setShowEidActionModal(false);
                                setShowApproveModal(true);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 14px',
                                background: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.05)',
                                border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)'}`,
                                borderRadius: 6,
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <FaCheck size={12} color="#22c55e" />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Approve</div>
                                <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)', marginTop: 2 }}>Mark ID as verified (result is acceptable)</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setShowEidActionModal(false);
                                setShowRequestDocsModal(true);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 14px',
                                background: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                                border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
                                borderRadius: 6,
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <FaFileAlt size={12} color="#ef4444" />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>Request Documents</div>
                                <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)', marginTop: 2 }}>Draft email to fee earner for client docs</div>
                              </div>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowEidActionModal(false)}
                            style={{
                              marginTop: 14,
                              width: '100%',
                              padding: '8px 14px',
                              background: 'transparent',
                              color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.2)'}`,
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>,
                      document.body
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
                            background: isDarkMode ? '#1e293b' : '#ffffff',
                            borderRadius: 8,
                            padding: 20,
                            maxWidth: 420,
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FaCheck size={16} color="#22c55e" />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>Approve ID Verification</div>
                              <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>{verificationDetails?.instructionRef || instructionRef}</div>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, lineHeight: 1.5, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)', marginBottom: 16 }}>
                            <p style={{ margin: '0 0 10px 0' }}>By approving, you confirm that:</p>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <li>The EID check results are satisfactory</li>
                              <li>The client's identity has been verified</li>
                              <li>No further documents are required</li>
                            </ul>
                          </div>

                          <div style={{
                            padding: 10,
                            background: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.05)',
                            border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)'}`,
                            borderRadius: 4,
                            fontSize: 11,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)',
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
                                color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                borderRadius: 4,
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
                                  if (onRefreshData) { try { await onRefreshData(); } catch { /* silent */ } }
                                } finally {
                                  setIsVerificationActionLoading(false);
                                }
                              }}
                              style={{
                                padding: '8px 14px',
                                background: '#22c55e',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isVerificationActionLoading ? 'default' : 'pointer',
                                opacity: isVerificationActionLoading ? 0.7 : 1,
                              }}
                            >
                              {isVerificationActionLoading ? 'Approving…' : 'Approve Verification'}
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
                            background: isDarkMode ? '#1e293b' : '#ffffff',
                            borderRadius: 8,
                            padding: 20,
                            maxWidth: 520,
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FaFileAlt size={16} color="#ef4444" />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>Request ID Documents</div>
                              <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>{verificationDetails?.instructionRef || instructionRef}</div>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, lineHeight: 1.5, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)', marginBottom: 14 }}>
                            Draft an email to the fee earner requesting additional ID documents from the client.
                          </div>

                          {/* Recipient Override Section */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 1)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                            borderRadius: 6,
                            padding: 14,
                            marginBottom: 14,
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                              Recipients
                            </div>

                            {/* To */}
                            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start', marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.75)', paddingTop: 6 }}>To</div>
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
                                      borderRadius: 6,
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                      background: isDarkMode ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                                      color: isDarkMode ? '#e2e8f0' : '#0f172a',
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
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                        borderRadius: 6,
                                        color: isDarkMode ? '#e2e8f0' : '#0f172a',
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
                                        color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(100, 116, 139, 0.18)'}`,
                                        borderRadius: 6,
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
                              <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.75)', paddingTop: 6 }}>CC</div>
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
                                      borderRadius: 6,
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                      background: isDarkMode ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                                      color: isDarkMode ? '#e2e8f0' : '#0f172a',
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
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                                        borderRadius: 6,
                                        color: isDarkMode ? '#e2e8f0' : '#0f172a',
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
                                          color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(100, 116, 139, 0.18)'}`,
                                          borderRadius: 6,
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
                                      color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
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
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 1)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                            borderRadius: 6,
                            padding: 14,
                            marginBottom: 14,
                            maxHeight: 280,
                            overflowY: 'auto',
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                              Template sent to client (via fee earner)
                            </div>
                            <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)', marginBottom: 8 }}>
                              <strong>Subject:</strong> Additional Documents Required - {verificationDetails?.instructionRef || instructionRef}
                            </div>
                            <div style={{
                              fontSize: 10,
                              lineHeight: 1.6,
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)',
                              padding: 10,
                              background: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : '#ffffff',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                              borderRadius: 4,
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
                            background: isDarkMode ? 'rgba(34, 197, 94, 0.06)' : 'rgba(34, 197, 94, 0.04)',
                            border: `1.5px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)'}`,
                            borderRadius: 6,
                            marginBottom: 14,
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: colours.green, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                              ✓ Ready to create draft
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', minWidth: 50 }}>Send to</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>
                                  {emailOverrideTo || feeEarnerEmail || '(no recipient)'}
                                </span>
                              </div>
                              {emailOverrideCc && (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', minWidth: 50 }}>CC</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)' }}>
                                    {emailOverrideCc}
                                  </span>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', minWidth: 50 }}>Subject</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)' }}>
                                  ID Documents Required – {verificationDetails?.instructionRef || instructionRef}
                                </span>
                              </div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', lineHeight: 1.4 }}>
                              This creates a <strong>draft only</strong> — the recipient can review, edit, and choose when to send it to the client.
                            </div>
                          </div>

                          <div style={{
                            padding: 8,
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)'}`,
                            borderRadius: 4,
                            fontSize: 10,
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.65)',
                            marginBottom: 16,
                          }}>
                            <strong>What happens:</strong> A draft email appears in the recipient's inbox. They review it, edit if needed, then send to the client. Nothing is sent automatically.
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
                                color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                borderRadius: 4,
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
                                background: (!emailOverrideTo && !feeEarnerEmail) ? '#94a3b8' : colours.green,
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 4,
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
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        <FaShieldAlt size={10} style={{ opacity: 0.6 }} /> Electronic ID (EID)
                      </div>
                    </div>

                    {/* Processing overlay */}
                    {eidProcessingState === 'processing' && (
                      <div style={{
                        padding: '20px 18px',
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                        borderRadius: 6,
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
                          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.55)', lineHeight: 1.5 }}>
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
                              padding: '12px 14px',
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}`,
                              borderRadius: 4,
                              marginBottom: 12,
                            }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8', marginBottom: 8 }}>
                                Readiness
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                                {checks.map(c => (
                                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 120 }}>
                                    <div style={{
                                      width: 14, height: 14, borderRadius: '50%',
                                      background: c.ready
                                        ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                                        : (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)'),
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      {c.ready
                                        ? <FaCheck size={7} color="#22c55e" />
                                        : <span style={{ width: 6, height: 1.5, background: '#ef4444', borderRadius: 1 }} />}
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: c.ready ? (isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)') : (isDarkMode ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.6)') }}>
                                      {c.label}
                                    </span>
                                    <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)', fontFamily: c.ready ? 'inherit' : undefined }}>
                                      {c.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {!allReady && (
                                <div style={{ marginTop: 8, fontSize: 10, color: isDarkMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.55)', lineHeight: 1.4 }}>
                                  Some data is missing — the check may fail. Ensure the instruction data is complete before running.
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div style={{
                          padding: '16px 18px',
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)',
                          border: `1px dashed ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                          borderRadius: 6,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 12,
                        }}>
                          <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)', textAlign: 'center', lineHeight: 1.5 }}>
                            No ID verification on record.<br />
                            <span style={{ fontSize: 11, opacity: 0.8 }}>Run a check to verify identity and compliance.</span>
                          </div>
                          {onTriggerEID ? (
                            <button
                              type="button"
                              disabled={isTriggerEidLoading}
                              onClick={(e) => { e.stopPropagation(); openTriggerEidConfirm(); }}
                              style={{
                                padding: '10px 20px',
                                background: colours.highlight,
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: 4,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isTriggerEidLoading ? 'default' : 'pointer',
                                opacity: isTriggerEidLoading ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <FaIdCard size={12} />
                              {isTriggerEidLoading ? 'Starting verification…' : 'Run ID Verification'}
                            </button>
                          ) : (
                            <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)' }}>
                              Verification not available
                            </div>
                          )}
                        </div>
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
                  background: 'rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                }}
                onClick={() => setShowTriggerEidConfirmModal(false)}
              >
                <div
                  style={{
                    background: isDarkMode ? '#1e293b' : '#ffffff',
                    borderRadius: 8,
                    padding: 24,
                    maxWidth: 420,
                    width: '90%',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(54, 144, 206, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaIdCard size={18} color={colours.highlight} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>Run ID Verification</div>
                      <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>Confirm notifications</div>
                    </div>
                  </div>

                  <div style={{
                    padding: 12,
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                    borderRadius: 6,
                    marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.9)', marginBottom: 8 }}>
                      What this does
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.78)' }}>
                      Starts an electronic ID verification with the provider and records the outcome back onto this instruction.
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.72)' }}>
                      <strong>Checks include:</strong>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Identity match (name + date of birth)</li>
                        <li>Address verification</li>
                        <li>PEP / sanctions screening</li>
                      </ul>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.72)' }}>
                      <strong>Client comms:</strong> No client emails are sent from Helix Hub in this flow.
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.72)' }}>
                      You’ll see results appear under EID Results once the check completes.
                    </div>

                    {isDemoInstruction && (
                      <div style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.15)'}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.9)', marginBottom: 8 }}>
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
                                borderRadius: 6,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(15, 23, 42, 0.92)',
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
                                  borderRadius: 6,
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                  background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(15, 23, 42, 0.92)',
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
                                  borderRadius: 6,
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                  background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.9)',
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(15, 23, 42, 0.92)',
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
                                color: isDarkMode ? 'rgba(248, 113, 113, 0.9)' : 'rgba(185, 28, 28, 0.9)',
                                border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(185, 28, 28, 0.25)'}`,
                                borderRadius: 6,
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
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.2)'}`,
                        borderRadius: 4,
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
                        borderRadius: 4,
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
              paymentStatus === 'complete' ? 'Payment received' : paymentStatus === 'review' ? 'Payment needs attention' : 'Payment pending',
              paymentStatus,
              paymentStatus === 'complete'
                ? `Received £${totalPaid.toLocaleString()}.`
                : paymentStatus === 'review'
                  ? 'Retry failed payment or issue a new link.'
                  : 'Send payment link or take payment on account.',
              <FaCreditCard size={12} />,
            )}
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
              documentStatus === 'complete' ? 'Docs on file' : 'Docs pending',
              documentStatus,
              documentStatus === 'complete' ? 'Review uploaded files and confirm completeness.' : 'Request ID, proof of address, or supporting documents.',
              <FaFileAlt size={12} />,
            )}
            {documents.length === 0 ? (
              <div style={{ 
                textAlign: 'center',
                padding: '24px 0',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
              }}>
                <FaFileAlt size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: 11 }}>No documents uploaded</div>
              </div>
            ) : (
              <>
                {/* Documents Table */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 90px 80px',
                    gap: 8,
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Document</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Date</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Action</span>
                  </div>

                  {/* Document Rows */}
                  {documents.slice(0, 8).map((doc: any, idx: number) => {
                    const docName = doc.FileName || doc.DocumentName || doc.name || 'Document';
                    const docType = doc.DocumentType || doc.type || doc.Category || 'File';
                    const docDate = doc.UploadDate || doc.created_at || doc.date;
                    const formattedDate = docDate 
                      ? new Date(docDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—';
                    
                    return (
                      <div
                        key={doc.id || doc.DocumentId || idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 100px 90px 80px',
                          gap: 8,
                          padding: '10px 12px',
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)'}`,
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FaFileAlt size={12} color={colours.highlight} style={{ flexShrink: 0 }} />
                          <span style={{ 
                            fontSize: 11, 
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {docName}
                          </span>
                        </div>
                        <span style={{ 
                          fontSize: 10, 
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                        }}>
                          {docType}
                        </span>
                        <span style={{ 
                          fontSize: 10, 
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                          textAlign: 'right',
                        }}>
                          {formattedDate}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          {onDocumentPreview && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDocumentPreview(doc); }}
                              style={{
                                padding: '4px 10px',
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                                color: colours.highlight,
                                border: 'none',
                                borderRadius: 4,
                                fontSize: 9,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              View
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer with count */}
                {documents.length > 8 && (
                  <div style={{ 
                    fontSize: 10, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                    textAlign: 'center',
                    paddingTop: 4,
                  }}>
                    +{documents.length - 8} more documents
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Risk Tab */}
        {activeTab === 'risk' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              riskStatus === 'complete' ? 'Risk completed' : riskStatus === 'review' ? 'Risk requires review' : 'Risk pending',
              riskStatus,
              riskStatus === 'complete'
                ? 'Risk assessed and recorded.'
                : riskStatus === 'review'
                  ? 'High risk flagged. Review assessment and approvals.'
                  : 'Complete AML risk assessment before proceeding.',
              <FaShieldAlt size={12} />,
            )}
            {!riskComplete ? (
              <div style={{ 
                textAlign: 'center',
                padding: '24px 0',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
              }}>
                <FaShieldAlt size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: 11, marginBottom: 12 }}>Risk assessment not completed</div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowLocalRiskModal(true); }}
                  style={{
                    padding: '8px 16px',
                    background: colours.highlight,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaShieldAlt size={11} />
                  Complete Assessment
                </button>
              </div>
            ) : (
              <>
                {/* Risk Content Card - matches enquiry/pitch design */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  borderRadius: 0,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    
                    {/* Row 1: Status Chips + Timestamp */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Assessed DateTime Chip - styled like Pitched chip */}
                        {complianceDateTime && (
                          <div
                            title="Assessment completed"
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 10px', borderRadius: 4,
                              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                            }}
                          >
                            <FaShieldAlt size={10} style={{ color: colours.highlight }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>Assessed {complianceDateTime}</span>
                          </div>
                        )}
                        
                        {/* Result Badge */}
                        <div
                          title={`Risk: ${riskResult}`}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 4,
                            background: isHighRisk 
                              ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
                              : (isDarkMode ? 'rgba(115, 171, 96, 0.12)' : 'rgba(115, 171, 96, 0.08)'),
                            border: `1px solid ${isHighRisk 
                              ? (isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.15)')
                              : (isDarkMode ? 'rgba(115, 171, 96, 0.25)' : 'rgba(115, 171, 96, 0.15)')}`,
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 600, color: isHighRisk ? colours.cta : colours.green }}>{riskResult}</span>
                        </div>
                        
                        {/* Score Badge */}
                        {riskScore !== undefined && riskScore !== null && (
                          <div
                            title={`Risk Score: ${riskScore}`}
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '5px 10px', borderRadius: 4,
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                            }}
                          >
                            <Icon iconName="NumberSymbol" styles={{ root: { fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' } }} />
                            <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{riskScore}</span>
                          </div>
                        )}
                        
                        {/* Assessor Badge */}
                        <div
                          title={`Assessed by: ${riskAssessor}`}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 4,
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                          }}
                        >
                          <FaUser size={9} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' }} />
                          <span style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{riskAssessor}</span>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Compliance Confirmations Data Bar */}
                    <div style={{ 
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0, 
                      padding: '10px 0',
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                    }}>
                      {[
                        { label: 'Client Risk', value: clientRiskConsidered ? 'Considered' : null, docUrl: 'https://drive.google.com/file/d/1_7dX2qSlvuNmOiirQCxQb8NDs6iUSAhT/view?usp=sharing' },
                        { label: 'Transaction Risk', value: transactionRiskConsidered ? 'Considered' : null, docUrl: 'https://drive.google.com/file/d/1sTRII8MFU3JLpMiUcz-Y6KBQ1pP1nKgT/view?usp=sharing' },
                        { label: 'Sanctions', value: firmWideSanctionsConsidered ? 'Considered' : null, docUrl: 'https://drive.google.com/file/d/1Wx-dHdfXuN0-A2YmBYb-OO-Bz2wXevl9/view?usp=sharing' },
                        { label: 'AML Policy', value: firmWideAMLConsidered ? 'Considered' : null, docUrl: 'https://drive.google.com/file/d/1TcBlV0Pf0lYlNkmdOGRfpx--DcTEC7na/view?usp=sharing' },
                      ].map((item, idx, arr) => (
                        <React.Fragment key={idx}>
                          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '0 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                                {item.label}
                              </span>
                              <span style={{ 
                                fontSize: 12, 
                                fontWeight: item.value ? 500 : 400, 
                                color: item.value 
                                  ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b')
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8'),
                              }}>
                                {item.value || '—'}
                              </span>
                            </div>
                            <a 
                              href={item.docUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              title={`View ${item.label} policy`}
                              style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 6px',
                                color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : '#94a3b8',
                                textDecoration: 'none',
                                borderRadius: 4,
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => { 
                                e.currentTarget.style.color = colours.highlight; 
                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.05)';
                              }}
                              onMouseLeave={(e) => { 
                                e.currentTarget.style.color = isDarkMode ? 'rgba(148, 163, 184, 0.4)' : '#94a3b8'; 
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <FaChevronRight size={10} />
                            </a>
                          </div>
                          {idx < arr.length - 1 && (
                            <div style={{ width: 1, height: 28, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Row 3: Assessment Questions & Answers Chip */}
                    <div style={{
                      padding: '12px 14px',
                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                      borderRadius: 6
                    }}>
                      {/* Header with Edit button */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                          <FaShieldAlt size={10} style={{ opacity: 0.6 }} />
                          Assessment Answers
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowLocalRiskModal(true); }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            color: colours.highlight,
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <FaEdit size={9} />
                          Edit Assessment
                        </button>
                      </div>
                      
                      {/* Q&A Grid - alternating rows for visual clarity */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[
                          { question: 'Client Type', answer: riskClientType },
                          { question: 'How was Client Introduced?', answer: howIntroduced },
                          { question: 'Source of Funds', answer: sourceOfFunds },
                          { question: 'Destination of Funds', answer: destinationOfFunds },
                          { question: 'Funds Type', answer: fundsType },
                          { question: 'Value of Instruction', answer: valueOfInstruction },
                          { question: 'Limitation Period', answer: limitationPeriod },
                          { question: 'Transaction Risk Level', answer: riskLevel },
                        ].map((item, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '8px 10px',
                              background: idx % 2 === 0 
                                ? (isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(0,0,0,0.015)')
                                : 'transparent',
                              borderRadius: 4,
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : '#64748b' }}>
                              {item.question}
                            </span>
                            <span style={{ 
                              fontSize: 11, 
                              fontWeight: 600, 
                              color: item.answer && item.answer !== '—' 
                                ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b')
                                : (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : '#94a3b8'),
                              textAlign: 'right',
                            }}>
                              {item.answer || '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Matter Tab */}
        {activeTab === 'matter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => { console.log('[MATTER-DEBUG] Matter tab rendering. activeTab =', activeTab, ', hasMatter =', hasMatter, ', inst =', !!inst, ', showLocalMatterModal =', showLocalMatterModal); return null; })()}
            {renderStatusBanner(
              matterStageStatus === 'complete' ? 'Matter opened' : 'Matter pending',
              matterStageStatus,
              matterStageStatus === 'complete' ? 'Matter link ready. Open in Clio or sync details.' : 'Open matter to generate Display Number and link client.',
              <FaFolder size={12} />,
            )}
            {!hasMatter ? (
              <div style={{ 
                textAlign: 'center',
                padding: '24px 0',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
              }}>
                <FaFolder size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: 11, marginBottom: 12 }}>Matter not yet opened</div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); console.log('[MATTER-DEBUG] Open Matter button clicked. inst =', !!inst, 'inst.InstructionRef =', inst?.InstructionRef, 'hasMatter =', hasMatter); setShowLocalMatterModal(true); }}
                  style={{
                    padding: '8px 16px',
                    background: colours.highlight,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaFolder size={11} />
                  Open Matter
                </button>
              </div>
            ) : (
              <>
                {/* Matter Content Card - matches pitch tab design */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  borderRadius: 0,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    
                    {/* Row 1: Chips + Date - matches pitch layout */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Opened DateTime Chip - blue highlight like "Pitched" chip */}
                        {matterOpenDate && matterOpenDate !== '—' && (
                          <div
                            title="Matter opened"
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 10px', borderRadius: 4,
                              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                            }}
                          >
                            <FaFolder size={10} style={{ color: colours.highlight }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>Opened {matterOpenDate}</span>
                          </div>
                        )}
                        
                        {/* Display Number Badge - like passcode chip */}
                        <div
                          title={`Matter: ${matterRef}`}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 4,
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.04)'}`,
                          }}
                        >
                          <FaFolder size={9} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' }} />
                          <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{matterRef}</span>
                        </div>
                      </div>
                      
                      {/* Clio Matter ID badge - right side like timestamp */}
                      {matter?.MatterID && (
                        <div style={{ 
                          display: 'flex', alignItems: 'center', gap: 6, 
                          fontSize: 11, 
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : '#475569',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0,0,0,0.03)',
                          padding: '4px 10px',
                          borderRadius: 4,
                        }}>
                          <FaLink size={9} style={{ opacity: 0.6 }} />
                          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{matter.MatterID}</span>
                        </div>
                      )}
                    </div>

                    {/* Row 2: Data Bar - matches pitch layout */}
                    <div style={{ 
                      display: 'flex', flexWrap: 'wrap', gap: 0, 
                      padding: '10px 0',
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : '#f8fafc',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`
                    }}>
                      {[
                        { label: 'Responsible', value: matterResponsibleSolicitor !== '—' ? matterResponsibleSolicitor : feeEarner !== '—' ? feeEarner : null },
                        { label: 'Practice Area', value: matterPracticeArea !== '—' ? matterPracticeArea : areaOfWork !== '—' ? areaOfWork : null },
                        { label: 'Status', value: matterStatus !== '—' ? matterStatus : null },
                        { label: 'Value', value: matterValue !== '—' ? matterValue : null },
                        { label: 'Supervising', value: matter?.SupervisingPartner || null },
                        { label: 'Originating', value: matterOriginatingSolicitor !== '—' && matterOriginatingSolicitor !== matterResponsibleSolicitor ? matterOriginatingSolicitor : null },
                      ].filter(item => item.value).map((item, idx, arr) => (
                        <React.Fragment key={idx}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>
                              {item.label}
                            </span>
                            <span style={{ 
                              fontSize: 12, 
                              fontWeight: 500, 
                              lineHeight: '18px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b',
                            }}>
                              {item.value}
                            </span>
                          </div>
                          {idx < arr.length - 1 && (
                            <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', margin: '4px 0' }} />
                          )}
                        </React.Fragment>
                      ))}
                      {/* Empty state if no data bar items */}
                      {![matterResponsibleSolicitor, matterPracticeArea, matterStatus, matterValue, matter?.SupervisingPartner].some(v => v && v !== '—') && (
                        <div style={{ padding: '0 14px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8', fontSize: 11 }}>
                          Matter details pending sync
                        </div>
                      )}
                    </div>

                    {/* Row 3: Client + Value section - like Amount/Service */}
                    {(matterClientName !== '—' || matterValue !== '—') && (
                      <div style={{ 
                        display: 'flex', alignItems: 'stretch', gap: 10,
                        padding: '10px 14px',
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : '#e2e8f0'}`,
                        borderRadius: 6,
                      }}>
                        {matterClientName !== '—' && (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Client</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: colours.highlight }}>{matterClientName}</span>
                            </div>
                            {matterDescription !== '—' && (
                              <div style={{ width: 1, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0', alignSelf: 'stretch' }} />
                            )}
                          </>
                        )}
                        {matterDescription !== '—' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : '#94a3b8' }}>Description</span>
                            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b' }}>{matterDescription}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Row 4: Source info if available - like pitch content preview */}
                    {(matter?.Source || matter?.Referrer) && (
                      <div style={{
                        padding: '12px 14px',
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : '#f8fafc',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : '#e2e8f0'}`,
                        borderRadius: 6,
                        fontSize: 12,
                        lineHeight: 1.65,
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b',
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FaLink size={10} style={{ opacity: 0.6 }} />
                          Origin
                        </div>
                        <div style={{ opacity: 0.85, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {matter.Source && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' }}>Source:</strong> {matter.Source}</span>
                          )}
                          {matter.Referrer && (
                            <span><strong style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : '#64748b' }}>Referrer:</strong> {matter.Referrer}</span>
                          )}
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
              background: isDarkMode ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
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
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.95)' : 'rgba(15, 23, 42, 0.9)',
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
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
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
                  background: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
                  border: `1px solid ${colours.green}`,
                  borderRadius: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <FaCheckCircle size={14} style={{ color: colours.green }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: colours.green }}>
                      Payment link created
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
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
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
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
                <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>
                  Generates a one-off Stripe Checkout link for this instruction. Nothing is sent automatically — copy the link and send it to the client.
                </div>

                {/* Amount Input */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
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
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                    }}>£</span>
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
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                        borderRadius: 0,
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                        outline: 'none',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colours.highlight;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)';
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
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
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
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                      borderRadius: 0,
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colours.highlight;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)';
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
                          ? (isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)')
                          : (isDarkMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.02)'),
                        border: `1px solid ${paymentLinkIncludesVat ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)')}`,
                        borderRadius: 0,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: 18,
                        height: 18,
                        borderRadius: 0,
                        border: `2px solid ${paymentLinkIncludesVat ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)')}`,
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
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                        }}>
                          {paymentLinkIncludesVat ? 'Add VAT (20%)' : 'No VAT'}
                        </div>
                        <div style={{
                          fontSize: 9,
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
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
                              <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>Net:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)' }}>£{netAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>VAT (20%):</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)' }}>£{vatAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`, paddingTop: 4 }}>
                              <span style={{ fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>Total:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: colours.green }}>£{totalAmount.toFixed(2)}</span>
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
                              <span style={{ fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>Total (no VAT):</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>£{totalAmount.toFixed(2)}</span>
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
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
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
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
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
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
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

      {/* Risk Assessment Modal — portalled to body to avoid transform/overflow clipping */}
      {showLocalRiskModal && inst && createPortal(
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
            padding: '20px'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLocalRiskModal(false); }}
        >
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
              onBack={() => setShowLocalRiskModal(false)}
              instructionRef={inst.InstructionRef || inst.instructionRef || ''}
              riskAssessor={currentUser?.FullName || 'Unknown'}
              existingRisk={risk}
              onSave={(savedRisk) => {
                // Don't close modal here — RiskAssessmentPage shows its own
                // success toast then calls onBack() after 1200ms to close
                if (onRiskAssessmentSave) onRiskAssessmentSave(savedRisk);
                // Refresh instruction data so risk tab updates without manual refresh
                if (onRefreshData) onRefreshData();
                // Show parent-level toast for confirmation outside the modal
                showToast({ type: 'success', title: 'Risk Assessment Saved', message: `Result: ${savedRisk?.RiskAssessmentResult || 'Complete'}` });
              }}
            />
          </div>
        </div>,
        document.body
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
                // Derive userInitials from currentUser email → teamData lookup, or feeEarner match
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
                if (onRefreshData) onRefreshData();
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