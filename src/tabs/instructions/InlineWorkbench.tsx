import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-icons/fa';

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
  stageStatuses?: Partial<Record<WorkbenchTab | 'id', StageStatus>>;
  teamData?: TeamData[] | null;
  enableContextStageChips?: boolean;
  contextStageKeys?: ContextStageKey[];
  onDocumentPreview?: (doc: any) => void;
  onOpenRiskAssessment?: (instruction: any) => void;
  onOpenMatter?: (instruction: any) => void;
  onTriggerEID?: (instructionRef: string) => void | Promise<void>;
  onOpenIdReview?: (instructionRef: string) => void;
  onConfirmBankPayment?: (paymentId: string, confirmedDate: string) => void | Promise<void>;
  onClose?: () => void;
};

const InlineWorkbench: React.FC<InlineWorkbenchProps> = ({
  item,
  isDarkMode,
  initialTab = 'details',
  stageStatuses,
  teamData,
  enableContextStageChips = false,
  contextStageKeys,
  onDocumentPreview,
  onOpenRiskAssessment,
  onOpenMatter,
  onTriggerEID,
  onOpenIdReview,
  onConfirmBankPayment,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab);
  const [activeContextStage, setActiveContextStage] = useState<ContextStageKey | null>(null);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [teamsCardLink, setTeamsCardLink] = useState<string | null>(null);
  const [isTeamsLinkLoading, setIsTeamsLinkLoading] = useState(false);
  const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);
  const [isVerificationDetailsLoading, setIsVerificationDetailsLoading] = useState(false);
  const [verificationDetailsError, setVerificationDetailsError] = useState<string | null>(null);
  const [isEidDetailsExpanded, setIsEidDetailsExpanded] = useState(true);
  const [isEnquiryNotesExpanded, setIsEnquiryNotesExpanded] = useState(false);
  const [isRawRecordExpanded, setIsRawRecordExpanded] = useState(false);
  const [isVerificationActionLoading, setIsVerificationActionLoading] = useState(false);
  const [isTriggerEidLoading, setIsTriggerEidLoading] = useState(false);
  const [showEidActionModal, setShowEidActionModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRequestDocsModal, setShowRequestDocsModal] = useState(false);
  const [showTriggerEidConfirmModal, setShowTriggerEidConfirmModal] = useState(false);
  const { showToast } = useToast();
  const [emailOverrideTo, setEmailOverrideTo] = useState<string>('');
  const [emailOverrideCc, setEmailOverrideCc] = useState<string>('');
  const [useManualToRecipient, setUseManualToRecipient] = useState<boolean>(false);
  const [useManualCcRecipients, setUseManualCcRecipients] = useState<boolean>(false);
  
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
      setActiveContextStage(null);
    }
  }, [initialTab]);

  useEffect(() => {
    // Reset context panel when switching to a different instruction/enquiry payload.
    setActiveContextStage(null);
  }, [item]);

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
    const contextStage: ContextStageKey = enableContextStageChips
      ? (activeContextStage ?? 'instructed')
      : 'instructed';

    const sources: any[] =
      contextStage === 'enquiry'
        ? [enquiry, inst, clients?.[0], deal, pitch, item]
        : contextStage === 'pitch'
          ? [deal, pitch, enquiry, inst, clients?.[0], item]
          : [inst, clients?.[0], deal, enquiry, pitch, item];

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
  const enquiryValueRaw = getValue(['Value', 'value']);
  const ultimateSource = getValue(['Ultimate_Source', 'UltimateSource', 'ultimateSource', 'Source', 'source']);
  const campaign = getValue(['Campaign', 'campaign']);
  const adGroup = getValue(['Ad_Group', 'AdGroup', 'adGroup', 'ad_group']);
  const searchKeyword = getValue(['Search_Keyword', 'SearchKeyword', 'searchKeyword', 'search_keyword']);
  const referralUrl = getValue(['Referral_URL', 'ReferralURL', 'referralUrl', 'url']);
  const website = getValue(['Website', 'website']);
  const gclid = getValue(['GCLID', 'gclid']);
  const enquiryRating = getValue(['Rating', 'rating']);
  const enquiryNotesRaw = getValue(
    ['Initial_first_call_notes', 'InitialFirstCallNotes', 'notes', 'Notes'],
    ''
  );
  const enquiryNotes = String(enquiryNotesRaw ?? '').replace(/\r\n/g, '\n');
  const hasEnquiryNotes = enquiryNotes.trim().length > 0;
  
  // Personal details
  const dobRaw = getValue(['DateOfBirth', 'dateOfBirth', 'DOB']);
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

  // Timeline dates
  const pitchDateRaw = deal?.PitchedDate || deal?.pitchedDate || deal?.CreatedDate || deal?.createdDate || pitch?.CreatedAt || pitch?.createdAt || null;
  const pitchDate = formatDate(pitchDateRaw);
  
  const matterOpenDateRaw = getValue(['MatterOpenDate', 'matter_open_date', 'MatterCreatedDate', 'OpenedDate', 'opened_at']);
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
  const nationalityFull = getValue(['Nationality', 'nationality']);
  
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
  const passport = getValue(['PassportNumber', 'passportNumber']);
  const license = getValue(['DriversLicenseNumber', 'driversLicenseNumber', 'DrivingLicenseNumber']);
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
  const houseNum = getValue(['HouseNumber', 'houseNumber'], '');
  const street = getValue(['Street', 'street'], '');
  const streetFull = `${houseNum} ${street}`.trim() || '—';
  const city = getValue(['City', 'city', 'Town']);
  const county = getValue(['County', 'county']);
  const postcode = getValue(['Postcode', 'postcode', 'PostCode']);
  const country = getValue(['Country', 'country']);
  
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
    if (!isDemoInstruction) {
      showToast({ type: 'loading', message: 'Starting ID verification…' });
    }
    try {
      await onTriggerEID(instructionRef);
      if (!isDemoInstruction) {
        showToast({ type: 'success', message: 'Verification request sent' });
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to start verification' });
    } finally {
      setIsTriggerEidLoading(false);
    }
  }, [onTriggerEID, instructionRef, showToast, isDemoInstruction]);

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
  const riskLevel = risk?.TransactionRiskLevel || '—';
  const riskAssessor = risk?.RiskAssessor || '—';
  const sourceOfFunds = risk?.SourceOfFunds || '—';
  const sourceOfWealth = risk?.SourceOfWealth || '—';
  const riskResult = risk?.RiskAssessmentResult || '—';
  const complianceDate = risk?.ComplianceDate 
    ? new Date(risk.ComplianceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
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
  
  // Matter status
  const hasMatter = !!(inst?.MatterId || inst?.MatterRef);
  const matterRef = inst?.MatterRef || inst?.DisplayNumber || inst?.MatterId || '—';
  const matterStatus = inst?.MatterStatus || inst?.Stage || '—';
  const instructionStage = String(inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.stage ?? '').trim();
  const isInstructionInitialised = /initiali[sz]ed/i.test(instructionStage);
  const feeEarner = getValue(['HelixContact', 'FeeEarner', 'feeEarner']);

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
    eidStatus === 'verified' ? 'complete' : eidStatus === 'failed' ? 'review' : 'pending'
  )) as StageStatus;

  // Normalised per-tab statuses (prefer pipeline stageStatuses)
  const paymentStatus: StageStatus = (stageStatuses?.payment || (hasSuccessfulPayment ? 'complete' : hasFailedPayment ? 'review' : 'pending')) as StageStatus;
  const riskStatus: StageStatus = (stageStatuses?.risk || (riskComplete ? (isHighRisk ? 'review' : 'complete') : 'pending')) as StageStatus;
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
        gap: 12,
        padding: '10px 12px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: colors.text, display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{title}</span>
            <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.78)' }}>{prompt}</span>
          </div>
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
        label: 'ID', 
        icon: <FaIdCard size={10} />,
        date: null, // No specific date for ID
        dateRaw: null,
        isComplete: hasId || eidStatus === 'verified',
        hasIssue: eidStatus === 'failed',
        status: (stageStatuses?.id || (eidStatus === 'verified' ? 'complete' : eidStatus === 'failed' ? 'review' : 'pending')) as StageStatus,
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
        isComplete: riskComplete,
        hasIssue: isHighRisk,
        status: (stageStatuses?.risk || (riskComplete ? (isHighRisk ? 'review' : 'complete') : 'pending')) as StageStatus,
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
        status: (stageStatuses?.matter || (hasMatter ? 'complete' : 'pending')) as StageStatus,
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
  }, [prospectId, hasId, eidStatus, hasSuccessfulPayment, hasFailedPayment, documents.length, riskComplete, isHighRisk, hasMatter, stageStatuses, pitchDate, pitchDateRaw, submissionDate, submissionDateRaw, paymentDate, paymentDateRaw, matterOpenDate, matterOpenDateRaw, firstDocUploadDate, firstDocUploadDateRaw, isInstructedComplete, instructedStatus]);

  const contextStageKeyList = useMemo(() => (
    contextStageKeys && contextStageKeys.length > 0
      ? contextStageKeys
      : (['enquiry', 'pitch', 'instructed'] as ContextStageKey[])
  ), [contextStageKeys?.join('|')]);

  const pipelineStages = useMemo(() => {
    const allowedContextStages = new Set(contextStageKeyList);
    return timelineStages.filter((stage) => {
      if (['enquiry', 'pitch', 'instructed'].includes(stage.key)) {
        return allowedContextStages.has(stage.key as ContextStageKey);
      }
      return true;
    });
  }, [timelineStages, contextStageKeyList]);

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
      if (isComplete) return { 
        bg: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
        border: '#22c55e',
        text: '#22c55e'
      };
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
        padding: '10px 12px',
        background: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.05)',
        border: `1px dashed ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.25)'}`,
        borderRadius: 4,
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
              gridTemplateColumns: '90px 1fr 60px 90px 70px 24px',
              gap: 8,
              padding: '8px 12px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(0, 0, 0, 0.015)',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
            }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Method</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Status</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Date</span>
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
                    gridTemplateColumns: '90px 1fr 60px 90px 70px 24px',
                    gap: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: isExpanded 
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                      : 'transparent',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)'}`,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span style={{ 
                    fontSize: 12, 
                    fontWeight: 600, 
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                    fontFamily: 'monospace',
                  }}>
                    £{Number(payment.amount || 0).toLocaleString()}
                  </span>
                  <span style={{ 
                    fontSize: 11, 
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {payment.description || payment.product_description || 'Payment'}
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
                      fontSize: 9,
                      padding: '3px 8px',
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
                    fontSize: 10, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                    textAlign: 'right',
                  }}>
                    {formattedDate}
                  </span>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 0,
                    background: isExpanded 
                      ? colours.highlight
                      : 'transparent',
                    border: `1px solid ${isExpanded ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)')}`,
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
                    padding: '14px 16px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(248, 250, 252, 0.8)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  }}>
                    {/* Payment Details Sub-section */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                        <FaReceipt size={10} /> Transaction Details
                      </div>

                      {/* Details grid - styled like Identity tab */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 10,
                      }}>
                        <div style={{
                          padding: '8px 10px',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          borderRadius: 0,
                        }}>
                          <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700, marginBottom: 4 }}>Product</div>
                          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', fontWeight: 600 }}>{payment.product_type || payment.product || 'Payment on Account'}</div>
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          borderRadius: 0,
                        }}>
                          <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700, marginBottom: 4 }}>Source</div>
                          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', fontWeight: 600 }}>{payment.source || payment.payment_source || 'Premium Checkout'}</div>
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          borderRadius: 0,
                        }}>
                          <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700, marginBottom: 4 }}>Currency</div>
                          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', fontWeight: 600 }}>{(payment.currency || 'GBP').toUpperCase()}</div>
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          borderRadius: 0,
                        }}>
                          <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700, marginBottom: 4 }}>Payment ID</div>
                          <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)', fontFamily: 'monospace', fontWeight: 500 }}>
                            {(payment.payment_id || payment.stripe_payment_id || payment.id || '—').slice(0, 16)}...
                          </div>
                        </div>
                      </div>
                      
                      {/* Instruction Ref - full width */}
                      <div style={{
                        marginTop: 10,
                        padding: '8px 10px',
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                        borderRadius: 0,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700 }}>Instruction Ref</span>
                        <span style={{ fontSize: 11, color: colours.highlight, fontFamily: 'monospace', fontWeight: 700 }}>{instructionRef || payment.instruction_ref || '—'}</span>
                      </div>
                    </div>

                    {/* Payment Journey Sub-section */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                        <FaExchangeAlt size={10} /> Payment Journey
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: 4, 
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(0, 0, 0, 0.015)',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
                        borderRadius: 0,
                      }}>
                        <JourneyStep label="Created" isActive={currentJourneyIndex === 0} isComplete={currentJourneyIndex > 0} />
                        <FaChevronRight size={8} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)', margin: '0 2px' }} />
                        <JourneyStep label="Requires Action" isActive={currentJourneyIndex === 1} isComplete={currentJourneyIndex > 1} />
                        <FaChevronRight size={8} style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)', margin: '0 2px' }} />
                        <JourneyStep label="Succeeded" isActive={currentJourneyIndex === 2} isComplete={false} />
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

                    {/* Actions */}
                    {payment.receipt_url && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); window.open(payment.receipt_url, '_blank'); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 12px',
                            background: colours.highlight,
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: 0,
                            fontSize: 9,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <FaReceipt size={9} />
                          View Receipt
                        </button>
                      </div>
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
        background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.95)',
        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.06)'}`,
        borderBottom: 'none',
        marginBottom: 0,
        fontFamily: 'Raleway, sans-serif',
        position: 'relative',
        zIndex: 5,
        pointerEvents: 'auto',
      }}
    >
      {/* Pipeline Tabs - Instructed → ID → Pay → Risk → Matter → Docs */}
      <div 
        data-action-button="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          padding: '8px 16px 0 32px',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255, 255, 255, 0.5)',
          position: 'relative',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {pipelineStages.map((stage, idx) => {
            const prevStage = idx > 0 ? pipelineStages[idx - 1] : null;
            // Enquiry and Pitch are context stages (faded, not tabs)
            const isContextStage = ['enquiry', 'pitch', 'instructed'].includes(stage.key);
            const isTabStage = ['identity', 'payment', 'risk', 'matter', 'documents'].includes(stage.key);
            const isActive = isTabStage && activeTab === stage.navigatesTo;
            const statusColors = getStagePalette(stage);
            const prevColors = prevStage ? (() => {
              if (prevStage.status === 'complete') return { line: '#22c55e' };
              if (prevStage.status === 'review') return { line: '#ef4444' };
              if (prevStage.status === 'processing') return { line: '#f59e0b' };
              return { line: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)' };
            })() : null;
            
            // Context stages (Enquiry, Pitch, Instructed)
            if (isContextStage) {
              const externalAction = (stage as any).externalAction as (() => void) | undefined;
              const isClickable = enableContextStageChips && (typeof externalAction === 'function' || stage.navigatesTo === 'details');
              const contextLabelColor = stage.isComplete
                ? (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)')
                : statusColors.text;
              const contextIconColor = stage.isComplete ? statusColors.text : statusColors.text;
              const contextHoverBg = stage.status === 'complete'
                ? (isDarkMode ? 'rgba(34, 197, 94, 0.22)' : 'rgba(34, 197, 94, 0.16)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.09)');

              return (
                <React.Fragment key={stage.key}>
                  {/* Connector line */}
                  {idx > 0 && (
                    <div style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      paddingBottom: 1,
                    }}>
                      <div style={{
                        height: 1,
                        width: 6,
                        background: prevColors?.line ?? (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'),
                      }} />
                    </div>
                  )}
                  {isClickable ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab('details');
                        // "Instructed" already has a rich landing view (Details with avatar),
                        // so only Enquiry/Pitch open the lightweight context panel.
                        if (stage.key === 'enquiry' || stage.key === 'pitch') {
                          setActiveContextStage(stage.key as ContextStageKey);
                        } else {
                          setActiveContextStage(null);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 10px',
                        background: statusColors.bg,
                        border: `1px solid ${statusColors.border}`,
                        borderBottom: 'none',
                        borderRadius: '4px 4px 0 0',
                        marginBottom: -1,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.18s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = contextHoverBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = statusColors.bg;
                      }}
                      title={stage.date || stage.label}
                    >
                      <span style={{
                        color: contextIconColor,
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        {stage.icon}
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: contextLabelColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}>
                        {stage.label}
                      </span>
                      {stage.isComplete && (
                        <FaCheck size={7} style={{ color: statusColors.text }} />
                      )}
                    </button>
                  ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 10px',
                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}`,
                      borderBottom: 'none',
                      borderRadius: '4px 4px 0 0',
                      opacity: 0.5,
                      marginBottom: -1,
                    }}
                    title={stage.date || stage.label}
                  >
                    <span style={{ 
                      color: stage.isComplete 
                        ? (isDarkMode ? 'rgba(34, 197, 94, 0.6)' : 'rgba(34, 197, 94, 0.5)')
                        : (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.35)'),
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      {stage.icon}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.45)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                    }}>
                      {stage.label}
                    </span>
                    {stage.isComplete && (
                      <FaCheck size={7} style={{ color: isDarkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.4)' }} />
                    )}
                  </div>
                  )}
                </React.Fragment>
              );
            }
            
            // Tab stages (ID, Pay, Risk, Matter, Docs) - clickable tabs
            return (
              <React.Fragment key={stage.key}>
                {/* Connector line */}
                {idx > 0 && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    paddingBottom: 1,
                  }}>
                    <div style={{
                      height: 1,
                      width: 6,
                      background: prevColors?.line ?? (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'),
                    }} />
                  </div>
                )}
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveContextStage(null);
                    // Toggle off to Details when clicking the active tab
                    if (isActive) {
                      setActiveTab('details');
                    } else {
                      setActiveTab(stage.navigatesTo as WorkbenchTab);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    background: isActive 
                      ? (activePalette?.bg ?? statusColors.bg)
                      : statusColors.bg,
                    border: `1px solid ${isActive ? (activePalette?.border ?? statusColors.border) : statusColors.border}`,
                    borderBottom: isActive ? 'none' : '1px solid transparent',
                    borderRadius: '4px 4px 0 0',
                    cursor: 'pointer',
                    marginBottom: 0,
                    transition: 'all 0.18s ease',
                    position: 'relative',
                    zIndex: isActive ? 3 : 1,
                  }}
                  title={`View ${stage.label}`}
                >
                  <span style={{ 
                    color: isActive ? (activePalette?.text ?? statusColors.text) : statusColors.text,
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    {stage.icon}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? (activePalette?.text ?? statusColors.text) : (stage.isComplete ? (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)') : statusColors.text),
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}>
                  {stage.label}
                </span>
                {/* Status indicator or count */}
                {(stage as any).count !== undefined && (stage as any).count > 0 ? (
                  <span style={{
                    minWidth: 14,
                    height: 14,
                    padding: '0 4px',
                    borderRadius: 3,
                    fontSize: 8,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: statusColors.text,
                    color: '#FFFFFF',
                  }}>
                    {(stage as any).count}
                  </span>
                ) : stage.isComplete ? (
                  <FaCheck size={8} style={{ color: statusColors.text }} />
                ) : stage.hasIssue ? (
                  <FaExclamationTriangle size={8} style={{ color: statusColors.text }} />
                ) : null}
              </div>
            </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Tab content - expand as needed */}
      <div style={{
        padding: '12px 16px 12px 32px',
        minHeight: 80,
        border: `1px solid ${isTabbedContent ? (activePalette?.border || colours.highlight) : (isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.12)')}`,
        borderTop: isTabbedContent ? `1px solid ${activePalette?.border || colours.highlight}` : (isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.12)'),
        borderRadius: 0,
        marginTop: -1,
        marginBottom: 0,
        boxShadow: 'none',
        transform: isTabbedContent ? 'translateY(0)' : 'translateY(-1px)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
      }}>
        {/* Details Tab - Client/Entity information landing page */}
        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              // For Details, treat null context as "instructed" (default landing).
              const contextStage: ContextStageKey = enableContextStageChips
                ? (activeContextStage ?? 'instructed')
                : 'instructed';

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
                    {(() => {
                      const chipBaseStyle: React.CSSProperties = {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '0 8px',
                        height: 24,
                        minHeight: 24,
                        borderRadius: 0,
                        boxSizing: 'border-box',
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: '24px',
                        textDecoration: 'none',
                        position: 'relative',
                      };

                      const chipActiveStyle: React.CSSProperties = {
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                        color: colours.highlight,
                      };

                      const chipInactiveStyle: React.CSSProperties = {
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)',
                      };

                      return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {/* Individual Avatar + Name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 0,
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <FaUser size={14} color={colours.highlight} style={{ opacity: 0.8 }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.95)' : 'rgba(15, 23, 42, 0.9)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              {fullName}
                              {/* Age/DOB not available at enquiry stage */}
                              {contextStage !== 'enquiry' && age !== '—' && <span style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)' }}>({age})</span>}
                            </div>
                            {isCompany && <div style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', marginTop: 1 }}>Director / Individual</div>}

                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {email !== '—' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 420 }}>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      try {
                                        window.open(`mailto:${encodeURIComponent(String(email))}`, '_blank');
                                      } catch {
                                        window.location.href = `mailto:${encodeURIComponent(String(email))}`;
                                      }
                                    }}
                                    title="Email"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      cursor: 'pointer',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.76)',
                                      fontSize: 10,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Icon iconName="Mail" styles={{ root: { fontSize: 10, opacity: 0.8 } }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                                  </div>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); void safeCopy(String(email)); }}
                                    title="Copy email"
                                    style={{
                                      width: 18,
                                      height: 18,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.14)'}`,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Icon iconName="Copy" styles={{ root: { fontSize: 10, opacity: 0.75 } }} />
                                  </div>
                                </div>
                              )}

                              {email !== '—' && phone !== '—' && (
                                <span style={{ fontSize: 10, opacity: 0.35, color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)' }}>·</span>
                              )}

                              {phone !== '—' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const tel = String(phone).replace(/\s+/g, '');
                                      try {
                                        window.open(`tel:${tel}`, '_self');
                                      } catch {
                                        window.location.href = `tel:${tel}`;
                                      }
                                    }}
                                    title="Call"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      cursor: 'pointer',
                                      color: isDarkMode ? 'rgba(226, 232, 240, 0.82)' : 'rgba(15, 23, 42, 0.76)',
                                      fontSize: 10,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Icon iconName="Phone" styles={{ root: { fontSize: 10, opacity: 0.8 } }} />
                                    <span>{phone}</span>
                                  </div>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); void safeCopy(String(phone)); }}
                                    title="Copy phone"
                                    style={{
                                      width: 18,
                                      height: 18,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.14)'}`,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Icon iconName="Copy" styles={{ root: { fontSize: 10, opacity: 0.75 } }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Company if applicable */}
                        {isCompany && companyName !== '—' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 0,
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <FaBuilding size={14} color={isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)'} />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)' }}>{companyName}</div>
                              {companyNo !== '—' && <div style={{ fontSize: 9, fontFamily: 'monospace', color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', marginTop: 1 }}>{companyNo}</div>}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Source chips */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {acContactId ? (
                          <a href={`https://helix-law54533.activehosted.com/app/contacts/${acContactId}`} target="_blank" rel="noopener noreferrer" title={`ActiveCampaign #${acContactId}`} onClick={(e) => e.stopPropagation()}
                            style={{ ...chipBaseStyle, ...chipActiveStyle }}>
                            <img src={activecampaignIcon} alt="" style={{ width: 12, height: 12, filter: activeCampaignBlueFilter, display: 'block' }} />
                            <span>AC</span>
                            <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#22c55e', border: `1.5px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : '#fff'}` }} />
                          </a>
                        ) : (
                          <div title="Not linked to ActiveCampaign" style={{ ...chipBaseStyle, ...chipInactiveStyle }}>
                            <img src={activecampaignIcon} alt="" style={{ width: 12, height: 12, opacity: 0.35, filter: 'grayscale(100%)', display: 'block' }} />
                            <span>AC</span>
                          </div>
                        )}
                        {(teamsCardLink || teamsIdentifier) ? (
                          <button type="button" title={teamsCardLink ? 'Open Teams card' : 'Resolve Teams link'} onClick={async (e) => { e.stopPropagation(); const link = teamsCardLink || (await resolveTeamsCardLink()); if (link) window.open(link, '_blank'); else window.open('https://teams.microsoft.com/', '_blank'); }}
                            style={{ ...chipBaseStyle, ...chipActiveStyle, cursor: 'pointer', opacity: isTeamsLinkLoading ? 0.6 : 1, background: chipActiveStyle.background }}>
                            <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 13, color: colours.highlight, lineHeight: '13px', display: 'block' } }} />
                            <span>Teams</span>
                            <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#22c55e', border: `1.5px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : '#fff'}` }} />
                          </button>
                        ) : (
                          <div title="No Teams card linked" style={{ ...chipBaseStyle, ...chipInactiveStyle }}>
                            <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 13, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', lineHeight: '13px', display: 'block' } }} />
                            <span>Teams</span>
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })()}

                    {/* Meta tags (match enquiry table/overview look & feel) */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}` }}>
                      {(() => {
                        const tagBase: React.CSSProperties = {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(0, 0, 0, 0.08)'}`,
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(2, 6, 23, 0.03)',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.82)',
                          fontSize: 10,
                          fontWeight: 600,
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
                              <Icon iconName={opts.iconName} styles={{ root: { fontSize: 11, opacity: 0.9 } }} />
                              <span style={{ ...tagText, fontFamily: opts.monospace ? 'monospace' : undefined }}>
                                {valueText}
                              </span>
                            </div>
                          );
                        };

                        if (contextStage === 'enquiry') {
                          const aowAccent = resolveAowAccent(areaOfWork);
                          const ratingIcon = enquiryRating === 'Good' ? 'Like' : enquiryRating === 'Poor' ? 'Dislike' : 'Like';

                          return (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {renderTag({ iconName: 'Tag', label: 'Area of Work', value: areaOfWork, accentLeft: aowAccent })}
                                {renderTag({ iconName: 'Calendar', label: 'Received', value: submissionDate })}
                                {renderTag({ iconName: 'Contact', label: 'Point of Contact', value: pointOfContact })}
                                {renderTag({ iconName: 'ContactCard', label: 'Method', value: methodOfContact })}
                                {renderTag({ iconName: 'TextDocument', label: 'Type', value: typeOfWork })}
                                {renderTag({ iconName: 'Money', label: 'Value', value: enquiryValue })}
                                {renderTag({ iconName: ratingIcon, label: 'Rating', value: enquiryRating })}
                                {renderTag({ iconName: 'ContactInfo', label: 'Taker', value: callTaker })}
                              </div>

                              {(isMeaningful(enquirySourceSummary) || isMeaningful(campaign) || isMeaningful(adGroup) || isMeaningful(searchKeyword) || isMeaningful(website) || isMeaningful(gclid)) && (
                                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, opacity: 0.92 }}>
                                  {renderTag({ iconName: 'Info', label: 'Source', value: enquirySourceSummary })}
                                  {renderTag({ iconName: 'Tag', label: 'Campaign', value: campaign })}
                                  {renderTag({ iconName: 'BulletedList', label: 'Ad group', value: adGroup })}
                                  {renderTag({ iconName: 'Search', label: 'Keyword', value: searchKeyword })}
                                  {renderTag({ iconName: 'Globe', label: 'Website', value: website })}
                                  {renderTag({ iconName: 'NumberSymbol', label: 'GCLID', value: gclid, monospace: true, onClick: () => void safeCopy(String(gclid)) })}
                                </div>
                              )}
                            </>
                          );
                        }

                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {renderTag({ iconName: 'CompletedSolid', label: 'Stage', value: matterStatus })}
                            {renderTag({ iconName: 'NumberSymbol', label: 'Ref', value: instructionRef, monospace: true, onClick: instructionRef ? () => void safeCopy(String(instructionRef)) : undefined })}
                            {renderTag({ iconName: 'TextDocument', label: 'Matter', value: matterRef, monospace: true })}
                            {renderTag({ iconName: 'Contact', label: 'Fee earner', value: feeEarner })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Enquiry notes (collapsed by default, like table view) */}
                    {contextStage === 'enquiry' && hasEnquiryNotes && (
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

                    {/* Address is not available at enquiry stage */}
                    {contextStage !== 'enquiry' && (
                      <>
                        {/* Address */}
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                              <FaHome size={9} /> Address
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); void safeCopy([streetFull, city, county, postcode, country].filter((v) => v !== '—' && v).join(', ')); }} style={{ background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', display: 'flex', alignItems: 'center', gap: 3 }} title="Copy full address">
                              <FaCopy size={8} /> Copy
                            </button>
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', lineHeight: 1.4 }}>
                            {[streetFull, city, county, postcode, country].filter((v: string) => v && v !== '—').join(', ') || '—'}
                          </div>
                        </div>

                        {/* Company Address (if company client) */}
                        {isCompany && companyName !== '—' && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                <FaBuilding size={9} /> Company Address
                              </div>
                              <button type="button" onClick={(e) => { e.stopPropagation(); void safeCopy([companyStreetFull, companyCity, companyCounty, companyPostcode, companyCountry].filter((v) => v !== '—' && v).join(', ')); }} style={{ background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', display: 'flex', alignItems: 'center', gap: 3 }} title="Copy company address">
                                <FaCopy size={8} /> Copy
                              </button>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 500, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', lineHeight: 1.4 }}>
                              {[companyStreetFull, companyCity, companyCounty, companyPostcode, companyCountry].filter((v) => v && v !== '—').join(', ') || '—'}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}


            {/* Pitch Landing (Details layout) */}
            {enableContextStageChips && activeContextStage === 'pitch' && (
              <div style={{
                background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderRadius: 0,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 14px',
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 800, color: colours.highlight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <FaUser size={11} /> Pitch
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.75)' }}>
                      {pitchDate && pitchDate !== '—' ? `Pitched ${pitchDate}` : 'No pitch recorded'}
                    </div>
                  </div>

                  {prospectId && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEnquiryFromContext(); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 0,
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                        color: colours.highlight,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Open this enquiry in Prospects"
                    >
                      <FaLink size={10} />
                      Open Enquiry
                    </button>
                  )}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                  padding: '10px 14px',
                }}>
                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Amount</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>
                      {formatMoney(deal?.Amount ?? deal?.amount ?? deal?.FeeAmount ?? deal?.feeAmount)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Service</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>
                      {deal?.ServiceDescription || deal?.serviceDescription || areaOfWork || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Passcode</div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                      cursor: (deal?.Passcode || deal?.passcode) ? 'pointer' : 'default',
                    }}
                      onClick={(e) => {
                        const passcode = (deal?.Passcode || deal?.passcode) as any;
                        if (!passcode) return;
                        e.stopPropagation();
                        void safeCopy(String(passcode));
                      }}
                      title={(deal?.Passcode || deal?.passcode) ? 'Click to copy' : undefined}
                    >
                      {(deal?.Passcode || deal?.passcode || '—') as any}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Client</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)' }}>{fullName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Contact</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)' }}>{email !== '—' ? email : phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)' }}>Instruction Ref</div>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)' }}>{instructionRef || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Instruction / Pitch Reference (hidden for enquiry-only view) */}
            {(() => {
              const contextStage: ContextStageKey = enableContextStageChips
                ? (activeContextStage ?? 'instructed')
                : 'instructed';

              if (contextStage === 'enquiry') return null;

              const dealPasscode = (deal?.Passcode || deal?.passcode) as any;
              const dealId = (deal?.DealId || deal?.dealId) as any;

              const refLabel = contextStage === 'pitch' ? 'Deal' : 'Ref';

              const refValueRaw =
                contextStage === 'pitch'
                  ? String(dealPasscode || dealId || instructionRef || '')
                  : String(instructionRef || '');

              const refValue = refValueRaw && refValueRaw.trim().length > 0 ? refValueRaw : '—';
              const canCopy = refValue !== '—';

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255, 255, 255, 0.5)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 0,
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{refLabel}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                      cursor: canCopy ? 'pointer' : 'default',
                      opacity: canCopy ? 1 : 0.7,
                    }}
                    onClick={(e) => {
                      if (!canCopy) return;
                      e.stopPropagation();
                      void safeCopy(refValue);
                    }}
                    title={canCopy ? 'Click to copy' : undefined}
                  >
                    {refValue}
                  </div>
                  {feeEarner !== '—' && (
                    <>
                      <div style={{ width: 1, height: 12, background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)' }} />
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>FE</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)' }}>{feeEarner}</div>
                    </>
                  )}
                  {contextStage === 'instructed' && matterRef !== '—' && (
                    <>
                      <div style={{ width: 1, height: 12, background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)' }} />
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Matter</div>
                      <div style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: colours.highlight, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (onOpenMatter) onOpenMatter(item); }} title="Open matter">{matterRef}</div>
                    </>
                  )}
                </div>
              );
            })()}
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

            {/* ID Verification Section (full-width combined) */}
            <div style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderRadius: 0,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 14px',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <FaIdCard size={11} /> ID Verification
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 12,
                padding: '10px 14px',
              }}>
                {/* ID Document - visual display of which was used vs. alternatives */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                    <FaIdCard size={11} /> Document Provided
                  </div>
                  {(() => {
                    const hasPassport = passport !== '—';
                    const hasLicense = license !== '—';
                    const selected: 'passport' | 'license' | null = hasPassport ? 'passport' : hasLicense ? 'license' : null;

                    const OptionButton = ({
                      label,
                      icon,
                      value,
                      expiry,
                      expiryRaw,
                      isSelected,
                      isDisabled,
                    }: {
                      label: string;
                      icon: React.ReactNode;
                      value: string;
                      expiry: string;
                      expiryRaw: unknown;
                      isSelected: boolean;
                      isDisabled: boolean;
                    }) => {
                      const expiryRawText = typeof expiryRaw === 'string'
                        ? expiryRaw
                        : (expiryRaw == null ? undefined : undefined);

                      const expiryStatus = getExpiryStatusColor(expiryRawText, isDarkMode);
                      const displayExpiry = expiry !== '—'
                        ? (expiryStatus.label ? expiryStatus.label : `Expires ${expiry}`)
                        : '';

                      return (
                        <button
                          type="button"
                          disabled
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            minHeight: 54,
                            borderRadius: 4,
                            border: `1px solid ${isSelected ? '#22c55e' : isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
                            background: isSelected
                              ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                            color: isSelected
                              ? '#22c55e'
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)'),
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: isDisabled ? 0.45 : 1,
                            cursor: 'default',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18 }}>
                                {icon}
                              </span>
                              <div style={{
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: '0.4px',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {label}
                              </div>
                            </div>
                            <span style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: isSelected ? '#22c55e' : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)'),
                              flexShrink: 0,
                            }} />
                          </div>

                          <div style={{
                            fontSize: 11,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: isSelected
                              ? '#22c55e'
                              : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)'),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {value !== '—' ? value : '—'}
                          </div>

                          {displayExpiry && (
                            <div style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: expiryStatus.color,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {displayExpiry}
                            </div>
                          )}
                        </button>
                      );
                    };

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <OptionButton
                            label="Passport"
                            icon={<FaPassport size={12} />}
                            value={passport}
                            expiry={passportExpiry}
                            expiryRaw={passportExpiryRaw}
                            isSelected={selected === 'passport'}
                            isDisabled={!!selected && selected !== 'passport'}
                          />
                          <OptionButton
                            label="Driving licence"
                            icon={<FaIdCard size={12} />}
                            value={license}
                            expiry={licenseExpiry}
                            expiryRaw={licenseExpiryRaw}
                            isSelected={selected === 'license'}
                            isDisabled={!!selected && selected !== 'license'}
                          />
                        </div>

                        {!selected && (
                          <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)' }}>
                            No document provided.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* EID Results with colour coding - only show when verification has been run */}
                {eidStatus !== 'pending' ? (
                <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <FaShieldAlt size={11} /> Electronic ID (EID)
                    {isManuallyApproved && (
                      <span style={{
                        marginLeft: 6,
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.12)',
                        color: '#f59e0b',
                        fontSize: 7,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}>
                        Manually Approved
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    {
                      key: 'overall' as const,
                      label: 'Overall',
                      // Show "Approved" for manual approvals to distinguish from automatic "Pass"
                      value: isManuallyApproved ? 'Approved' : (eidResult && eidResult !== '—' ? eidResult : (verificationDetails?.overallResult || '—')),
                    },
                    {
                      key: 'pep' as const,
                      label: 'PEP/Sanctions',
                      value: (pepResult && pepResult !== '—' ? pepResult : (verificationDetails?.pepResult || '—')),
                    },
                    {
                      key: 'address' as const,
                      label: 'Address',
                      value: (addressVerification && addressVerification !== '—' ? addressVerification : (verificationDetails?.addressResult || '—')),
                    },
                  ].map((item, idx) => {
                    const value = String(item.value || '—');
                    // For Overall tile when manually approved, treat "Approved" as pass
                    const isPass = value.toLowerCase().includes('pass') || value.toLowerCase().includes('clear') || value.toLowerCase().includes('no match') || value.toLowerCase().includes('verified') || value.toLowerCase() === 'approved';
                    const isWarn = value.toLowerCase().includes('review') || value.toLowerCase().includes('refer');
                    const isFail = value.toLowerCase().includes('fail') || value.toLowerCase().includes('match');
                    const resultColor = value === '—'
                      ? (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)')
                      : isPass
                        ? colours.green
                        : (isFail || isWarn)
                          ? colours.cta
                          : (isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)');

                    const pillStatus: 'pass' | 'fail' | 'pending' | 'warn' = value === '—'
                      ? 'pending'
                      : isPass
                        ? 'pass'
                        : isFail
                          ? 'fail'
                          : isWarn
                            ? 'warn'
                            : 'pending';

                    const tile = eidTileDetails[item.key];
                    const meaningfulFailures = (tile.failures || []).filter((f) => isMeaningfulFailureReason(f.reason));

                    // Only the Overall tile is clickable when it shows fail/warn
                    const isOverallNeedsAction = item.key === 'overall' && (isFail || isWarn);

                    return (
                      <div
                        key={idx}
                        onClick={isOverallNeedsAction ? () => setShowEidActionModal(true) : undefined}
                        style={{
                          padding: '8px 10px',
                          background: isOverallNeedsAction 
                            ? (isDarkMode ? 'rgba(239, 68, 68, 0.045)' : 'rgba(239, 68, 68, 0.025)')
                            : (isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.75)'),
                          border: isOverallNeedsAction
                            ? `1px solid rgba(239, 68, 68, 0.75)`
                            : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                          borderRadius: 4,
                          cursor: isOverallNeedsAction ? 'pointer' : 'default',
                          transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                          boxShadow: isOverallNeedsAction ? `0 0 0 1px rgba(239, 68, 68, 0.10)` : 'none',
                        }}
                        title={isOverallNeedsAction ? 'Click to review and resolve' : undefined}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {item.label}
                          </div>
                          <StatusPill
                            status={pillStatus}
                            label={value === '—' ? 'Pending' : isPass ? 'Pass' : isFail ? 'Fail' : isWarn ? 'Review' : 'Pending'}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, color: resultColor }}>
                            {isPass ? <FaCheckCircle size={12} /> : (isFail || isWarn) ? <FaExclamationTriangle size={12} /> : null}
                          </span>
                          <div style={{ fontSize: 10, fontWeight: 650, color: resultColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{value}</div>
                        </div>

                        {isOverallNeedsAction && (
                          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: 999,
                              background: isDarkMode ? 'rgba(239, 68, 68, 0.10)' : 'rgba(239, 68, 68, 0.08)',
                              border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.22)'}`,
                              color: '#ef4444',
                              fontSize: 10,
                              fontWeight: 750,
                              letterSpacing: '0.1px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}>
                              Review options <span style={{ fontWeight: 900 }}>→</span>
                            </div>
                          </div>
                        )}

                        {isEidDetailsExpanded && verificationDetails && (
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {meaningfulFailures.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {meaningfulFailures.map((f, fIdx) => (
                                  <div key={fIdx} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 6, alignItems: 'baseline' }}>
                                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)', textAlign: 'left' }}>
                                      {fIdx === 0 ? 'Fail' : ''}
                                    </div>
                                    <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.72)' }}>
                                      {f.reason}{f.code ? ` (${f.code})` : ''}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Metadata row - always visible */}
                <div style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.3px' }}>Checked</span>
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)' }}>
                      {formatMaybeDate(verificationDetails?.checkedDate) || verificationDetails?.checkedDate || eidDate || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.3px' }}>Provider</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)',
                        cursor: verificationMeta.provider !== '—' ? 'pointer' : 'default',
                      }}
                      onClick={(e) => {
                        if (verificationMeta.provider === '—') return;
                        e.stopPropagation();
                        void safeCopy(verificationMeta.provider);
                      }}
                      title={verificationMeta.provider !== '—' ? 'Click to copy' : undefined}
                    >
                      {verificationMeta.provider || '—'}
                    </span>
                  </div>
                  {verificationMeta.correlationId !== '—' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                      <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.3px' }}>Ref</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)',
                          cursor: 'pointer',
                          maxWidth: 100,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void safeCopy(verificationMeta.correlationId);
                        }}
                        title={`${verificationMeta.correlationId}\n\nClick to copy`}
                      >
                        {verificationMeta.correlationId}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded details - additional refs + raw record */}
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

                    {/* Raw record toggle */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}>
                      <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Raw Record
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsRawRecordExpanded((v) => !v); }}
                        style={{
                          padding: '5px 10px',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.72)',
                        }}
                        title="Show the raw verification payload stored for this check"
                      >
                        {isRawRecordExpanded ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {isRawRecordExpanded && (
                      <div style={{
                        marginTop: 6,
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
                            const parsed = parseRawResponse(verificationDetails.rawResponse);
                            if (parsed && typeof parsed === 'object') {
                              try {
                                return JSON.stringify(parsed, null, 2);
                              } catch {
                                return String(verificationDetails.rawResponse ?? '');
                              }
                            }
                            return typeof verificationDetails.rawResponse === 'string'
                              ? verificationDetails.rawResponse
                              : String(verificationDetails.rawResponse ?? '');
                          })()}
                        </pre>
                      </div>
                    )}

                    {/* EID Action Picker Modal */}
                    {showEidActionModal && (
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
                      </div>
                    )}

                    {/* Approve Verification Modal */}
                    {showApproveModal && (
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
                      </div>
                    )}

                    {/* Request Documents Modal */}
                    {showRequestDocsModal && (
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
                      </div>
                    )}
                      </>
                    )}
                  </div>
                )}
                </div>
                ) : (
                  /* EID not yet run - show CTA to start verification */
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <FaShieldAlt size={11} /> Electronic ID (EID)
                      </div>
                    </div>
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
                  </div>
                )}
              </div>
            </div>

            {/* Trigger EID Confirmation Modal - shown before starting verification */}
            {showTriggerEidConfirmModal && (
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
              </div>
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
                ? `Received £${totalPaid.toLocaleString()}. Add receipt or continue.`
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
                ? 'Risk assessment recorded. Check score and confirmations.'
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
                {onOpenRiskAssessment && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenRiskAssessment(inst); }}
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
                )}
              </div>
            ) : (
              <>
                {/* Risk Summary Card */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  {/* Header with Result */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StatusPill 
                        status={isHighRisk ? 'fail' : 'pass'} 
                        label={riskResult} 
                      />
                      {riskScore !== undefined && riskScore !== null && (
                        <span style={{ 
                          fontSize: 11, 
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
                        }}>
                          Score: <strong style={{ fontFamily: 'monospace' }}>{riskScore}</strong>
                        </span>
                      )}
                    </div>
                    <span style={{ 
                      fontSize: 10, 
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                    }}>
                      {complianceDate}
                    </span>
                  </div>

                  {/* Risk Details Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 1,
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  }}>
                    {/* Cell 1: Risk Level */}
                    <div style={{
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Level</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{riskLevel}</div>
                    </div>
                    {/* Cell 2: Assessor */}
                    <div style={{
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Assessor</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{riskAssessor}</div>
                    </div>
                    {/* Cell 3: Jurisdiction */}
                    <div style={{
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Jurisdiction</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{jurisdiction}</div>
                    </div>
                  </div>
                </div>

                {/* Client Profile Card */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Client Profile</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 16px' }}>
                    {[
                      { label: 'Client Type', value: riskClientType },
                      { label: 'How Introduced', value: howIntroduced },
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', fontWeight: 500 }}>{item.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Funds Analysis Card */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Funds Analysis</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 16px' }}>
                    {[
                      { label: 'Source of Funds', value: sourceOfFunds },
                      { label: 'Destination', value: destinationOfFunds },
                      { label: 'Source of Wealth', value: sourceOfWealth },
                      { label: 'Funds Type', value: fundsType },
                      { label: 'Value', value: valueOfInstruction },
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', fontWeight: 500 }}>{item.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance Confirmations Card */}
                <div style={{
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Compliance Confirmations</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Client Risk Factors', checked: clientRiskConsidered },
                      { label: 'Transaction Risk Factors', checked: transactionRiskConsidered },
                      { label: 'Sanctions Assessment', checked: firmWideSanctionsConsidered },
                      { label: 'AML Policy', checked: firmWideAMLConsidered },
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ 
                          width: 14, 
                          height: 14, 
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: item.checked ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)'),
                          color: item.checked ? '#fff' : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.3)'),
                          fontSize: 9,
                          flexShrink: 0,
                        }}>
                          {item.checked ? '✓' : ''}
                        </span>
                        <span style={{ 
                          fontSize: 10, 
                          color: item.checked 
                            ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)')
                            : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                          fontWeight: item.checked ? 500 : 400,
                        }}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Matter Tab */}
        {activeTab === 'matter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                {onOpenMatter && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenMatter(inst); }}
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
                )}
              </div>
            ) : (
              <div style={{
                background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                borderRadius: 6,
                overflow: 'hidden',
              }}>
                {/* Header with Status */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusPill status="pass" label="Opened" />
                    <span style={{ 
                      fontSize: 12, 
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                    }}>
                      {matterRef}
                    </span>
                  </div>
                  <span style={{ 
                    fontSize: 10, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                  }}>
                    {matterStatus}
                  </span>
                </div>

                {/* Matter Details Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 1,
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                }}>
                  {/* Cell 1: Area of Work */}
                  <div style={{
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Area of Work</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{areaOfWork}</div>
                  </div>
                  {/* Cell 2: Fee Earner */}
                  <div style={{
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Fee Earner</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{feeEarner}</div>
                  </div>
                  {/* Cell 3: Client */}
                  <div style={{
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Client</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{inst['Client Name'] || inst.client_name || '—'}</div>
                  </div>
                </div>
              </div>
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
    </div>
  );
};

export default InlineWorkbench;