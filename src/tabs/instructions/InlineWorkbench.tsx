import React, { useEffect, useMemo, useState } from 'react';
import type { TeamData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import {
  FaBuilding,
  FaCheckCircle,
  FaCopy,
  FaCreditCard,
  FaExclamationTriangle,
  FaFileAlt,
  FaFolder,
  FaHome,
  FaIdCard,
  FaShieldAlt,
} from 'react-icons/fa';

type StageStatus = 'pending' | 'processing' | 'review' | 'complete' | 'neutral';
type WorkbenchTab = 'identity' | 'payment' | 'risk' | 'matter' | 'documents';

type InlineWorkbenchProps = {
  item: any;
  isDarkMode: boolean;
  initialTab?: WorkbenchTab;
  stageStatuses?: Partial<Record<WorkbenchTab | 'id', StageStatus>>;
  teamData?: TeamData[] | null;
  onDocumentPreview?: (doc: any) => void;
  onOpenRiskAssessment?: (instruction: any) => void;
  onOpenMatter?: (instruction: any) => void;
  onTriggerEID?: (instructionRef: string) => void;
  onOpenIdReview?: (instructionRef: string) => void;
  onClose?: () => void;
};

const InlineWorkbench: React.FC<InlineWorkbenchProps> = ({
  item,
  isDarkMode,
  initialTab = 'identity',
  stageStatuses,
  onDocumentPreview,
  onOpenRiskAssessment,
  onOpenMatter,
  onTriggerEID,
  onOpenIdReview,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);

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
  }, [initialTab]);

  // Extract data from item
  const inst = item?.instruction;
  const deal = item?.deal;
  const eid = item?.eid;
  const risk = item?.risk;
  const documents = item?.documents || inst?.documents || [];
  const payments = inst?.payments || [];
  const clients = item?.clients || [];
  
  // Activity tracking (Teams card origin & AC contact)
  // Check multiple possible field locations
  const teamsActivityId = item?.teamsActivityId || item?.ActivityId || inst?.ActivityId || inst?.teamsActivityId;
  const acContactId = item?.acContactId || item?.AC_ContactId || item?.ActiveCampaignId || inst?.AC_ContactId || inst?.ActiveCampaignId || inst?.acContactId;

  // Helper to get value from multiple possible field names
  const getValue = (fields: string[], fallback = '—') => {
    for (const field of fields) {
      if (inst?.[field]) return inst[field];
      if (deal?.[field]) return deal[field];
      if (clients?.[0]?.[field]) return clients[0][field];
    }
    return fallback;
  };

  // Derive values
  const instructionRef = inst?.InstructionRef || deal?.InstructionRef || '';
  const firstName = getValue(['FirstName', 'firstName', 'first_name'], '');
  const lastName = getValue(['LastName', 'lastName', 'last_name'], '');
  const fullName = `${firstName} ${lastName}`.trim() || 'Unknown';
  const email = getValue(['ClientEmail', 'Email', 'email', 'LeadClientEmail']);
  const phone = getValue(['Telephone', 'Phone', 'phone', 'MobileNumber', 'Mobile']);
  const areaOfWork = getValue(['AreaOfWork', 'Area_of_Work', 'area']);
  const serviceDescription = getValue(['Notes', 'ServiceDescription', 'Description', 'description']);
  const description = serviceDescription; // Alias for the notes banner
  
  // Personal details
  const title = getValue(['Title', 'title']);
  const dobRaw = getValue(['DateOfBirth', 'dateOfBirth', 'DOB']);
  const formatDate = (raw: any) => {
    if (!raw || raw === '—') return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const dob = formatDate(dobRaw);
  const age = React.useMemo(() => {
    if (!dobRaw || dobRaw === '—') return '—';
    const parsed = new Date(dobRaw);
    if (Number.isNaN(parsed.getTime())) return '—';
    const diff = Date.now() - parsed.getTime();
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return `${years} yrs`;
  }, [dobRaw]);
  const gender = getValue(['Gender', 'gender', 'Sex', 'sex']);
  const nationality = getValue(['Nationality', 'nationality']);
  
  // ID status
  const passport = getValue(['PassportNumber', 'passportNumber']);
  const license = getValue(['DriversLicenseNumber', 'driversLicenseNumber', 'DrivingLicenseNumber']);
  const passportExpiryRaw = getValue(['PassportExpiry', 'PassportExpiryDate', 'passportExpiry', 'passportExpiryDate']);
  const licenseExpiryRaw = getValue(['DriversLicenseExpiry', 'DrivingLicenseExpiry', 'DrivingLicenceExpiry', 'LicenseExpiry', 'licenseExpiry']);
  const passportExpiry = formatDate(passportExpiryRaw);
  const licenseExpiry = formatDate(licenseExpiryRaw);
  const nationalId = getValue(['NationalInsuranceNumber', 'NINumber', 'NationalId']);
  const hasId = passport !== '—' || license !== '—';
  
  // Address
  const houseNum = getValue(['HouseNumber', 'houseNumber'], '');
  const street = getValue(['Street', 'street'], '');
  const streetFull = `${houseNum} ${street}`.trim() || '—';
  const city = getValue(['City', 'city', 'Town']);
  const county = getValue(['County', 'county']);
  const postcode = getValue(['Postcode', 'postcode', 'PostCode']);
  const country = getValue(['Country', 'country']);
  
  // Entity/Company
  const clientType = getValue(['ClientType', 'clientType']);
  const companyName = getValue(['CompanyName', 'Company', 'company']);
  const companyNo = getValue(['CompanyNumber', 'companyNumber', 'CompanyNo']);
  const companyCountry = getValue(['CompanyCountry', 'companyCountry']);
  
  // EID
  const eidResult = eid?.EIDOverallResult || '';
  const eidStatus = eidResult.toLowerCase().includes('pass') ? 'verified' 
    : eidResult.toLowerCase().includes('fail') ? 'failed' 
    : eidResult.toLowerCase().includes('skip') ? 'skipped'
    : eid ? 'completed' : 'pending';
  const pepResult = eid?.PEPAndSanctionsCheckResult || '—';
  const addressVerification = eid?.AddressVerificationResult || '—';
  const eidDate = eid?.EIDCheckedDate ? new Date(eid.EIDCheckedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const consentGiven = eid?.ConsentGiven ? 'Yes' : 'No';
  
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
  const clientRiskConsidered = risk?.ClientRiskConsidered;
  const transactionRiskConsidered = risk?.TransactionRiskConsidered;
  const riskCore = risk?.RiskCore || '—';
  
  // Matter status
  const hasMatter = !!(inst?.MatterId || inst?.MatterRef);
  const matterRef = inst?.MatterRef || inst?.DisplayNumber || inst?.MatterId || '—';
  const matterStatus = inst?.MatterStatus || inst?.Stage || '—';
  const feeEarner = getValue(['HelixContact', 'FeeEarner', 'feeEarner']);

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

  const identityStatusColors = getStatusColors(identityStatus);

  const renderStatusBanner = (
    title: string,
    status: StageStatus,
    prompt: string,
    icon: React.ReactNode,
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
      </div>
    );
  };

  // Tab definitions - order matches pipeline: ID → Pay → Risk → Matter → Docs
  // Use stageStatuses from pipeline when provided, otherwise fall back to local calculation
  const tabs = useMemo(() => [
    { 
      key: 'identity' as WorkbenchTab, 
      label: 'ID', 
      icon: <FaIdCard size={11} />,
      isComplete: hasId || eidStatus === 'verified',
      hasIssue: eidStatus === 'failed',
      status: (stageStatuses?.id || (eidStatus === 'verified' ? 'complete' : eidStatus === 'failed' ? 'review' : 'pending')) as StageStatus,
    },
    { 
      key: 'payment' as WorkbenchTab, 
      label: 'Pay', 
      icon: <FaCreditCard size={11} />,
      isComplete: hasSuccessfulPayment,
      hasIssue: hasFailedPayment,
      status: (stageStatuses?.payment || (hasSuccessfulPayment ? 'complete' : hasFailedPayment ? 'review' : 'pending')) as StageStatus,
    },
    { 
      key: 'risk' as WorkbenchTab, 
      label: 'Risk', 
      icon: <FaShieldAlt size={11} />,
      isComplete: riskComplete,
      hasIssue: isHighRisk,
      status: (stageStatuses?.risk || (riskComplete ? (isHighRisk ? 'review' : 'complete') : 'pending')) as StageStatus,
    },
    { 
      key: 'matter' as WorkbenchTab, 
      label: 'Matter', 
      icon: <FaFolder size={11} />,
      isComplete: hasMatter,
      hasIssue: false,
      status: (stageStatuses?.matter || (hasMatter ? 'complete' : 'pending')) as StageStatus,
    },
    { 
      key: 'documents' as WorkbenchTab, 
      label: 'Docs', 
      icon: <FaFileAlt size={11} />,
      isComplete: documents.length > 0,
      count: documents.length,
      status: (stageStatuses?.documents || (documents.length > 0 ? 'complete' : 'neutral')) as StageStatus,
    },
  ], [hasId, eidStatus, hasSuccessfulPayment, hasFailedPayment, documents.length, riskComplete, isHighRisk, hasMatter, stageStatuses]);

  // Stop all click events from bubbling up to the row (which toggles expansion)
  const handleWorkbenchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Minimal field display
  const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ 
        fontSize: 8, 
        color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.7)', 
        textTransform: 'uppercase', 
        letterSpacing: '0.5px',
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{ 
        fontSize: 11, 
        color: value === '—' 
          ? (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)')
          : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)'),
        fontFamily: mono ? 'monospace' : 'inherit',
        fontWeight: 500,
      }}>
        {value}
      </span>
    </div>
  );

  // Status pill
  const StatusPill = ({ status, label }: { status: 'pass' | 'fail' | 'pending' | 'warn'; label: string }) => {
    const bg = status === 'pass' ? 'rgba(34, 197, 94, 0.12)' 
      : status === 'fail' ? 'rgba(239, 68, 68, 0.12)'
      : status === 'warn' ? 'rgba(245, 158, 11, 0.12)'
      : 'rgba(148, 163, 184, 0.1)';
    const color = status === 'pass' ? colours.green 
      : status === 'fail' ? colours.cta
      : status === 'warn' ? colours.orange
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

  // Rich Payment Tab Content
  const PaymentTabContent = ({ 
    payments, 
    deal, 
    totalPaid, 
    instructionRef,
    isDarkMode,
    expandedPayment,
    setExpandedPayment,
  }: { 
    payments: any[]; 
    deal: any; 
    totalPaid: number;
    instructionRef: string;
    isDarkMode: boolean;
    expandedPayment: string | null;
    setExpandedPayment: (id: string | null) => void;
  }) => {
    const activePayments = payments.filter((p: any) => !p.archived && !p.deleted);
    const successfulPayments = activePayments.filter((p: any) => 
      p.payment_status === 'succeeded' || p.payment_status === 'confirmed'
    );
    const dealValue = deal?.Amount || deal?.amount || 0;

    // No payments state
    if (activePayments.length === 0) {
      return (
        <div style={{ 
          textAlign: 'center',
          padding: '24px 0',
          color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
        }}>
          <FaCreditCard size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: 11 }}>No payment records</div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Payment Method Selector - Show card vs bank visually */}
        <div style={{
          background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
          borderRadius: 0,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            <FaCreditCard size={11} /> Payment Method
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ type: 'CARD', icon: '💳', isUsed: successfulPayments.some((p: any) => p.payment_method === 'card' || (p.payment_type || '').toLowerCase().includes('card')) }, { type: 'BANK TRANSFER', icon: '🏦', isUsed: successfulPayments.some((p: any) => p.payment_method === 'bank' || p.payment_method === 'bank_transfer' || (p.payment_type || '').toLowerCase().includes('bank')) }].map((method, idx) => (
              <div key={idx} style={{
                flex: 1,
                padding: '8px 10px',
                background: method.isUsed 
                  ? isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)'
                  : isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                border: `1px solid ${method.isUsed ? '#22c55e' : isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)'}`,
                borderRadius: 4,
                textAlign: 'center',
                opacity: method.isUsed ? 1 : 0.5,
              }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{method.icon}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', letterSpacing: '0.3px' }}>{method.type}</div>
                {method.isUsed && <div style={{ fontSize: 8, color: '#22c55e', fontWeight: 700, marginTop: 2 }}>USED</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Payments Table */}
        <div style={{
          background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          borderRadius: 0,
          overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 90px 70px 24px',
            gap: 8,
            padding: '8px 12px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
          }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</span>
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
            
            // Payment journey states
            const journeyStates = ['created', 'requires_action', 'succeeded'];
            const currentJourneyIndex = isSuccess ? 2 : status === 'requires_action' ? 1 : 0;

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
                    gridTemplateColumns: '90px 1fr 90px 70px 24px',
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
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: isExpanded 
                      ? colours.highlight
                      : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)'),
                    color: isExpanded 
                      ? '#FFFFFF'
                      : colours.highlight,
                    fontSize: 8,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'all 0.2s ease',
                    boxShadow: isExpanded 
                      ? `0 0 8px ${colours.highlight}40`
                      : `0 0 0 2px ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)'}`,
                  }}>
                    ▶
                  </span>
                </div>

                {/* Expanded Payment Details */}
                {isExpanded && (
                  <div style={{
                    padding: '12px 16px',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.02)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  }}>
                    {/* Details description */}
                    <div style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: colours.highlight,
                      marginBottom: 12,
                      paddingLeft: 8,
                      borderLeft: `3px solid ${colours.highlight}`,
                    }}>
                      {payment.description || payment.product_description || 'Payment'}
                    </div>

                    {/* Details grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '8px 24px',
                      marginBottom: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Product</span>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', fontWeight: 500 }}>{payment.product_type || payment.product || 'Payment on Account of Costs'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Source</span>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', fontWeight: 500 }}>{payment.source || payment.payment_source || 'Premium Checkout'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Currency</span>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)', fontWeight: 600 }}>{(payment.currency || 'GBP').toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Payment ID</span>
                        <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.5)', fontFamily: 'monospace', fontWeight: 500 }}>
                          {(payment.payment_id || payment.stripe_payment_id || payment.id || '—').slice(0, 12)}...
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: 'span 2' }}>
                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Instruction Ref</span>
                        <span style={{ fontSize: 10, color: colours.highlight, fontFamily: 'monospace', fontWeight: 600 }}>{instructionRef || payment.instruction_ref || '—'}</span>
                      </div>
                    </div>

                    {/* Payment Journey */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600, marginBottom: 8 }}>
                        Payment Journey
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <JourneyStep label="Created" isActive={currentJourneyIndex === 0} isComplete={currentJourneyIndex > 0} />
                        <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)' }}>—</span>
                        <JourneyStep label="Requires Action" isActive={currentJourneyIndex === 1} isComplete={currentJourneyIndex > 1} />
                        <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)' }}>—</span>
                        <JourneyStep label="Succeeded" isActive={currentJourneyIndex === 2} isComplete={false} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {payment.receipt_url && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); window.open(payment.receipt_url, '_blank'); }}
                          style={{
                            padding: '5px 10px',
                            background: colours.highlight,
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: 0,
                            fontSize: 9,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          View Receipt
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
        borderBottom: `3px solid ${isDarkMode ? colours.highlight : colours.highlight}`,
        marginBottom: 1,
        fontFamily: 'Raleway, sans-serif',
        position: 'relative',
        zIndex: 5,
        pointerEvents: 'auto',
      }}
    >
      {/* Compact tab strip */}
      <div 
        data-action-button="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '0 16px 0 32px',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255, 255, 255, 0.5)',
          position: 'relative',
          zIndex: 20,
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          // Get colors matching the pipeline chips - always show colour coding
          const getStatusColors = () => {
            if (tab.status === 'complete') return { 
              bg: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              border: '#22c55e',
              text: '#22c55e'
            };
            if (tab.status === 'review') return {
              bg: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              border: '#ef4444',
              text: '#ef4444'
            };
            if (tab.status === 'processing') return {
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
          const statusColors = getStatusColors();
          
          return (
            <button
              type="button"
              key={tab.key}
              data-action-button="true"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveTab(tab.key);
              }}
              style={{
                padding: '6px 12px',
                margin: '6px 2px',
                border: `1px solid ${statusColors.border}`,
                background: isActive ? statusColors.bg : (isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)'),
                borderRadius: 0,
                color: statusColors.text,
                cursor: 'pointer',
                fontSize: 9,
                fontWeight: 600,
                fontFamily: 'Raleway, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                pointerEvents: 'auto',
                position: 'relative',
                minWidth: 70,
                justifyContent: 'center',
                opacity: isActive ? 1 : 0.7,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.background = statusColors.bg;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.background = isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)';
                }
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {/* Status indicator matching pipeline */}
              {(tab.count !== undefined && tab.count > 0) ? (
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
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content - expand as needed */}
      <div style={{
        padding: '12px 16px 12px 32px',
        minHeight: 80,
      }}>
        {/* Instructions Tab (Identity/Client Overview) */}
        {activeTab === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderStatusBanner(
              identityStatus === 'complete' ? 'ID Verified' : identityStatus === 'review' ? 'ID Needs Review' : 'ID Pending',
              identityStatus,
              identityStatus === 'complete'
                ? 'ID verification completed. Review details anytime.'
                : identityStatus === 'review'
                  ? 'Review and approve ID or request further documents.'
                  : 'Run ID verification to proceed.',
              identityStatus === 'complete' ? <FaCheckCircle size={12} /> : identityStatus === 'review' ? <FaExclamationTriangle size={12} /> : <FaIdCard size={12} />,
            )}

            {/* Client/Entity Header Card */}
            <div style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderRadius: 0,
              padding: '12px 14px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              {/* Avatar with origin badges */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 0,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {companyName !== '—' ? (
                    <FaBuilding size={24} color={colours.highlight} style={{ opacity: 0.7 }} />
                  ) : (
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: colours.highlight,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: 700,
                    }}>
                      {(firstName[0] || 'A').toUpperCase()}
                    </div>
                  )}
                </div>
                
                {/* Origin badges below avatar */}
                <div style={{
                  display: 'flex',
                  gap: 4,
                  justifyContent: 'center',
                }}>
                  {acContactId !== undefined && acContactId !== '—' && (
                    <a
                      href={`https://helix-law54533.activehosted.com/app/contacts/${acContactId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View in Active Campaign"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: isDarkMode ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.15)',
                        border: `1px solid ${isDarkMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#a855f7',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(168, 85, 247, 0.35)' : 'rgba(168, 85, 247, 0.25)';
                        e.currentTarget.style.borderColor = '#a855f7';
                        e.currentTarget.style.boxShadow = '0 0 6px rgba(168, 85, 247, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.15)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.3)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      AC
                    </a>
                  )}
                  {teamsActivityId && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        // In real implementation, this would deep-link to Teams card
                      }}
                      title="Original Teams card"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)',
                        border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#3b82f6',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.25)';
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.boxShadow = '0 0 6px rgba(59, 130, 246, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      T
                    </a>
                  )}
                </div>
              </div>

              {/* Name and Contact Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Primary name */}
                  <div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.95)' : 'rgba(15, 23, 42, 0.9)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {companyName !== '—' ? companyName : fullName}
                    </div>
                    {companyNo !== '—' && (
                      <div style={{
                        fontSize: 9,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}>
                        {companyNo}
                      </div>
                    )}
                  </div>

                  {/* Contact details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {email !== '—' && (
                      <div style={{ fontSize: 9, color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontWeight: 600, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Email</span>
                        <div style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                      </div>
                    )}
                    {phone !== '—' && (
                      <div style={{ fontSize: 9, color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)' }}>
                        <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontWeight: 600, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Phone</span>
                        <div>{phone}</div>
                      </div>
                    )}
                  </div>

                  {/* Instruction ref */}
                  <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Ref: {instructionRef}
                  </div>
                </div>
              </div>
            </div>

            {/* Key Details Grid (DOB, Nationality, Gender, Age) */}
            <div style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderRadius: 0,
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1,
                background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)',
              }}>
                {[{ label: 'DOB', value: dob, mono: false }, { label: 'Nationality', value: nationality, mono: false }, { label: 'Gender', value: gender, mono: false }, { label: 'Age', value: age, mono: false }]
                  .map((item, idx) => (
                    <div key={idx} style={{ padding: '10px 12px', background: isDarkMode ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)' }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', wordBreak: 'break-word', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{item.value}</div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Full Address Card with copy button */}
            <div style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
              borderRadius: 0,
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <FaHome size={11} />
                  Full Address
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const address = [streetFull, city, county, postcode, country].filter((v) => v !== '—' && v).join(', ');
                    void safeCopy(address);
                  }}
                  style={{ background: 'transparent', border: 'none', padding: '2px 6px', cursor: 'pointer', fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', display: 'flex', alignItems: 'center', gap: 4 }}
                  title="Copy full address"
                >
                  <FaCopy size={9} /> Copy
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[
                  { label: 'Street', value: streetFull },
                  { label: 'City', value: city },
                  { label: 'County', value: county },
                  { label: 'Postcode', value: postcode },
                  { label: 'Country', value: country },
                ].map((item, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', marginBottom: 2 }}>{item.label}</div>
                    <div 
                      style={{ 
                        fontSize: 10, 
                        fontWeight: 500, 
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)',
                        cursor: item.value !== '—' ? 'pointer' : 'default',
                      }}
                      onClick={(e) => { if (item.value !== '—') { e.stopPropagation(); void safeCopy(item.value); } }}
                      title={item.value !== '—' ? `Click to copy ${item.label.toLowerCase()}` : undefined}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ID Verification Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}>
              {/* ID Document Card - visual display of which was used vs. alternatives */}
              <div style={{
                background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderRadius: 0,
                padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  <FaIdCard size={11} /> ID Document
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Document options with visual indicator of selection */}
                  {[{ type: 'PASSPORT', value: passport, expiry: passportExpiry }, { type: 'DRIVING LICENSE', value: license, expiry: licenseExpiry }].map((doc, idx) => {
                    const isUsed = doc.value !== '—';
                    const isSelected = (passport !== '—' && doc.type === 'PASSPORT') || (passport === '—' && license !== '—' && doc.type === 'DRIVING LICENSE');
                    return (
                      <div key={idx} style={{
                        padding: '8px 10px',
                        background: isSelected 
                          ? isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)'
                          : isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                        border: `1px solid ${isSelected ? '#22c55e' : isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)'}`,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        opacity: isUsed ? 1 : 0.5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: isSelected ? '#22c55e' : isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.3)',
                          }} />
                          <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{doc.type}</span>
                        </div>
                        {isUsed ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{doc.value}</span>
                            {doc.expiry !== '—' && (
                              <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.65)' }}>
                                Expires {doc.expiry}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.3)', fontStyle: 'italic' }}>Not provided</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* EID Results Card with colour coding */}
              <div style={{
                background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderRadius: 0,
                padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <FaShieldAlt size={11} /> EID Results
                  </div>
                  {eidDate !== '—' && (
                    <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)' }}>{eidDate}</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Overall', value: eidResult || '—' },
                    { label: 'PEP/Sanctions', value: pepResult },
                    { label: 'Address', value: addressVerification },
                  ].map((item, idx) => {
                    const isPass = item.value.toLowerCase().includes('pass') || item.value.toLowerCase().includes('clear') || item.value.toLowerCase().includes('no match');
                    const isFail = item.value.toLowerCase().includes('fail') || item.value.toLowerCase().includes('refer') || item.value.toLowerCase().includes('match');
                    const resultColor = item.value === '—' 
                      ? (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)')
                      : isPass 
                        ? colours.green
                        : isFail 
                          ? colours.cta
                          : (isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.75)');
                    return (
                      <div key={idx}>
                        <div style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', marginBottom: 2 }}>{item.label}</div>
                        <div style={{ 
                          fontSize: 10, 
                          fontWeight: 600, 
                          color: resultColor,
                        }}>
                          {item.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Company Info - show if available */}
            {(companyName !== '—' || companyNo !== '—') && (
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
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <FaBuilding size={11} /> Business Details
                  </div>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 1,
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                }}>
                  <div style={{ padding: '10px 12px', background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Company Name</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{companyName}</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Company No</div>
                    <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{companyNo}</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Country</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{companyCountry}</div>
                  </div>
                </div>
              </div>
            )}

            {/* EID Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {eidStatus === 'pending' && onTriggerEID && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onTriggerEID(instructionRef); }}
                  style={{
                    padding: '8px 16px',
                    background: colours.highlight,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaIdCard size={11} />
                  Run ID Verification
                </button>
              )}
              {/* Review needed - show prominent action */}
              {(stageStatuses?.id === 'review' || eidStatus === 'failed') && onOpenIdReview && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenIdReview(instructionRef); }}
                  style={{
                    padding: '8px 16px',
                    background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaIdCard size={11} />
                  Review ID Verification
                </button>
              )}
              {/* View completed verification */}
              {stageStatuses?.id === 'complete' && onOpenIdReview && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenIdReview(instructionRef); }}
                  style={{
                    padding: '8px 16px',
                    background: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    border: '1px solid #22c55e',
                    borderRadius: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaIdCard size={11} />
                  View ID Verification
                </button>
              )}
            </div>
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
                    gridTemplateColumns: 'repeat(4, 1fr)',
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
                    {/* Cell 3: Source of Funds */}
                    <div style={{
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Source of Funds</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{sourceOfFunds}</div>
                    </div>
                    {/* Cell 4: Source of Wealth */}
                    <div style={{
                      padding: '10px 12px',
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Source of Wealth</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{sourceOfWealth}</div>
                    </div>
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
    </div>
  );
};

export default InlineWorkbench;
