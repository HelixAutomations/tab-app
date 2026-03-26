import React, { useState, useMemo } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Link } from '@fluentui/react/lib/Link';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { FaUser, FaCheckCircle, FaClipboard, FaIdCard, FaPoundSign, FaShieldAlt, FaFolder, FaFolderOpen, FaFileAlt, FaCheck, FaExclamationTriangle, FaChevronRight, FaChevronDown } from 'react-icons/fa';
import type { Enquiry, NormalizedMatter, TeamData, Transaction } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { WorkbenchJourneyRail } from '../../components/workbench/WorkbenchJourneyRail';
import PortalLaunchModal from '../../components/portal/PortalLaunchModal';
import InlineWorkbench from '../instructions/InlineWorkbench';
import CCLEditor from './ccl/CCLEditor';
import NextStepChip from './components/NextStepChip';
import { ADMIN_USERS, isCclUser } from '../../app/admin';
import { buildPortalLaunchModel } from '../../utils/portalLaunch';
import { normaliseId, resolveEnquiryKeys } from './utils/enquiryMatching';
import { appendDefaultEnquiryProcessingParams } from '../../app/functionality/enquiryProcessingModel';
import { fmt, fmtDate, fmtCurrency, safeNumber, get, formatLongDate, formatAddress, parseInstructionRef } from './utils/formatters';
import clioLogo from '../../assets/clio.svg';
import netdocumentsLogo from '../../assets/netdocuments.svg';
import {
  containerStyle, entryStyle, headerStyle, headerLeftStyle,
  statusBadgeStyle, mainLayoutStyle, leftColumnStyle, rightColumnStyle,
  sectionCardStyle, sectionTitleStyle,
  fieldRowStyle, fieldLabelStyle, clientFieldValueStyle,
  detailsMotionItemStyle,
  detailsSectionsStackStyle, detailSectionStyle, detailSectionHeaderStyle,
  detailSectionTitleStyle, detailFieldGridStyle,
  detailFieldCardStyle, detailFieldStackStyle,
  backendSystemPanelStyle,
  backendSystemHeaderStyle, backendSystemBrandStyle,
  backendSystemTitleStyle,
  backendTreeListStyle, backendTreePathStyle, backendTreeItemStyle,
  backendTreeMainStyle, backendTreeTextStyle, backendTreeTitleStyle, backendTreeMetaStyle,
  clientActionButtonStyle, contactRowStyle, copyChipStyle,
  clientFieldStackStyle, progressBarStyle, progressFillStyle,
  metricSubSkeletonStyle, BADGE_RADIUS,
  tabPanelContainerStyle, tabPanelHeaderStyle, cclStatusStyle,
  kpiBannerStyle, kpiBannerItemStyle,
  kpiStripStyle, kpiItemStyle, tabEmptyStateStyle,
  workbenchShellStyle, workbenchShellHeaderStyle, workbenchShellHeaderContentStyle,
  workbenchShellHeaderIconStyle, workbenchShellHeaderLabelStyle, workbenchShellBodyStyle,
  detailPanelsGridStyle,
} from './styles/matterOverview.styles';

interface MatterOverviewProps {
  matter: NormalizedMatter;
  activeTab?: 'overview' | 'activities' | 'documents' | 'communications' | 'billing';
  userInitials?: string;
  overviewData?: any;
  outstandingData?: any;
  wipStatus?: 'idle' | 'loading' | 'ready' | 'pending' | 'error';
  fundsStatus?: 'idle' | 'loading' | 'ready' | 'pending' | 'error';
  outstandingStatus?: 'idle' | 'loading' | 'ready' | 'error';
  auditEnabled?: boolean;
  auditStatus?: 'idle' | 'loading' | 'ready' | 'error';
  auditData?: any;
  onToggleAudit?: () => void;
  complianceData?: any;
  matterSpecificActivitiesData?: any;
  onEdit?: () => void;
  transactions?: Transaction[];
  workbenchItem?: any;
  enquiries?: Enquiry[] | null;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
  autoOpenCcl?: boolean;
  onCclOpened?: () => void;
}

interface MatterNetDocumentsWorkspaceResult {
  id?: string;
  name?: string;
  url?: string;
  client?: string;
  clientId?: string;
  matter?: string;
  matterKey?: string;
  createdBy?: string;
  modifiedBy?: string;
  archived?: boolean;
  deleted?: boolean;
}

interface MatterNetDocumentsContainerItem {
  id?: string;
  name?: string;
  type?: 'document' | 'container';
  extension?: string;
  modified?: string;
  modifiedBy?: string;
  url?: string;
}

interface MatterNetDocumentsBreadcrumb {
  id: string;
  name: string;
  type: 'workspace' | 'folder';
}

interface MatterDetailField {
  label: string;
  value: string;
  meta: string;
  tone?: string;
}

interface MatterClioCustomField {
  key: string;
  label: string;
  value: string;
}

type MatterCclServiceSummary = {
  stage: string;
  label: string;
  needsAttention: boolean;
  confidence?: string | null;
  attentionReason?: string | null;
};

function getMatterCclLabel(stage: string): string {
  switch (stage.toLowerCase()) {
    case 'generated':
      return 'Generated';
    case 'reviewed':
      return 'Reviewed';
    case 'sent':
      return 'Sent';
    default:
      return 'Pending';
  }
}

interface ClioMatterActivity {
  id?: number | string;
  type?: string;
  date?: string;
  created_at?: string;
  quantity_in_hours?: number | string;
  rounded_quantity_in_hours?: number | string;
  total?: number | string;
  note?: string;
  billed?: boolean;
  non_billable?: boolean;
  activity_description?: {
    id?: number | string;
    name?: string;
  };
  expense_category?: {
    id?: number | string;
    name?: string;
  };
}

type DetailSectionKey = 'matter' | 'activities' | 'custom' | 'assignments';
type DetailViewMode = 'all' | 'clio' | 'nd';

/* ------------------------------------------------------------------
   PipelineSection — renders pill bar + InlineWorkbench (pills suppressed)
   Mirrors the EnquiryTimeline pill bar exactly: same stage labels,
   same status logic, same styling. This IS the prospects pipeline,
   just reflected here read-only.
------------------------------------------------------------------ */

type WorkbenchTabKeyType = 'details' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents';
type ContextStageKeyType = 'enquiry' | 'pitch' | 'instructed';

interface PipelineSectionProps {
  derivedWorkbenchItem: any;
  isDarkMode: boolean;
  teamData?: TeamData[] | null;
  demoModeEnabled: boolean;
  matchedEnquiry: Enquiry | null;
  selectedWorkbenchTab: WorkbenchTabKeyType;
  setSelectedWorkbenchTab: (tab: WorkbenchTabKeyType) => void;
  selectedContextStage: ContextStageKeyType | null;
  setSelectedContextStage: (stage: ContextStageKeyType | null) => void;
  selectedMatterStage: 'ccl' | null;
  setSelectedMatterStage: (stage: 'ccl' | null) => void;
  onSelectCclStage: () => void;
  canSeeCcl?: boolean;
  collapsed?: boolean;
  expanded?: boolean;
  onToggleCollapsed?: () => void;
}

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const text = String(value).trim();
  return text !== '' && text !== '—' && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined';
};

const formatDetailText = (value: unknown, fallback = 'Not set'): string =>
  hasMeaningfulValue(value) ? fmt(String(value)) : fallback;

const formatDetailDate = (value: unknown, fallback = 'Not set'): string => {
  if (!hasMeaningfulValue(value)) return fallback;
  const formatted = fmtDate(value as any);
  return formatted && formatted !== '—' ? formatted : fallback;
};

const formatMatterAmount = (value: unknown, fallback = 'Not set'): string => {
  if (!hasMeaningfulValue(value)) return fallback;
  const raw = String(value).trim();
  if ((raw.match(/£/g) || []).length > 1 || raw.toLowerCase().includes(' to ')) return raw;
  const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? fmtCurrency(numeric) : fmt(raw);
};

const getPracticeAreaColor = (area: unknown): string => {
  switch (String(area || '').trim().toLowerCase()) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.greyText;
  }
};

const getChipTextColor = (toneColor: string, isDarkMode: boolean): string =>
  toneColor === colours.yellow
    ? (isDarkMode ? colours.dark.text : colours.light.text)
    : toneColor;

async function callGetMatterSpecificActivities({
  matterId,
  displayNumber,
  instructionRef,
  initials,
}: {
  matterId?: string;
  displayNumber?: string;
  instructionRef?: string;
  initials?: string;
}): Promise<{ data?: ClioMatterActivity[] } | null> {
  if (!matterId && !displayNumber) {
    return null;
  }

  const params = new URLSearchParams();
  if (matterId) params.set('matterId', matterId);
  if (displayNumber) params.set('displayNumber', displayNumber);
  if (instructionRef) params.set('instructionRef', instructionRef);
  if (initials) params.set('initials', initials);
  const url = `/api/matter-metrics/activities?${params.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error calling getMatterSpecificActivities:', errorText);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Error calling getMatterSpecificActivities:', error);
    return null;
  }
}

const getDetailChipStyle = (toneColor: string, isDarkMode: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'fit-content',
  maxWidth: '100%',
  padding: '4px 8px',
  border: `1px solid ${isDarkMode ? `${toneColor}55` : `${toneColor}33`}`,
  background: isDarkMode ? `${toneColor}18` : `${toneColor}12`,
  color: getChipTextColor(toneColor, isDarkMode),
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

const buildInitials = (value: unknown): string => {
  const text = String(value || '').trim();
  if (!text) return '—';
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || text.slice(0, 2).toUpperCase();
};

const summarizeContactChannel = (email: string, phone: string): string => {
  if (hasMeaningfulValue(email) && hasMeaningfulValue(phone)) return 'Email and phone captured';
  if (hasMeaningfulValue(email)) return 'Email captured';
  if (hasMeaningfulValue(phone)) return 'Phone captured';
  return 'No direct contact channel captured';
};

const PipelineSection: React.FC<PipelineSectionProps> = ({
  derivedWorkbenchItem,
  isDarkMode,
  teamData,
  demoModeEnabled,
  matchedEnquiry,
  selectedWorkbenchTab,
  setSelectedWorkbenchTab,
  selectedContextStage,
  setSelectedContextStage,
  selectedMatterStage,
  setSelectedMatterStage,
  onSelectCclStage,
  canSeeCcl = false,
  collapsed = false,
  expanded = true,
  onToggleCollapsed,
}) => {
  const item = derivedWorkbenchItem;
  const instruction = item?.instruction;
  const instructionRef = instruction?.InstructionRef || instruction?.instructionRef || '';
  const instructionStage = (instruction?.Stage || instruction?.stage || '').toLowerCase();
  const instructedDate = instruction?.instructedDate || instruction?.InstructedDate || instruction?.SubmissionDate || instruction?.submissionDate || instruction?.SubmittedAt || instruction?.submittedAt || instruction?.CreatedAt || instruction?.createdAt || instruction?.InstructionDateTime || instruction?.instructionDateTime;
  const isShellInstruction = Boolean(instructionRef) && (instructionStage === 'initialised' || instructionStage === 'opened' || instructionStage === 'pitched' || instructionStage === '');
  const hasInstruction = Boolean(instructionRef) && (Boolean(instructedDate) || !isShellInstruction);
  const hasInstructionActivity = Boolean(instructionRef);
  const stageStatuses = item?.stageStatuses;
  const payments = Array.isArray(item?.payments) ? item.payments : [];
  const risk = item?.risk;
  const eid = item?.eid;
  const matters = Array.isArray(item?.matters) ? item.matters : [];
  const documents = Array.isArray(item?.documents) ? item.documents : [];

  const eidResult = eid?.EIDOverallResult || instruction?.EIDOverallResult || '';
  const eidStatusValue = (eid?.EIDStatus || instruction?.EIDStatus || '').toLowerCase();
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
    : eid && eidResult
    ? 'completed'
    : 'pending';

  const eidDisplayResult = eidResult
    ? eidResult.charAt(0).toUpperCase() + eidResult.slice(1).toLowerCase()
    : null;

  const hasSuccessfulPayment = payments.some((p: any) =>
    p.payment_status === 'succeeded' || p.payment_status === 'confirmed'
  );
  const hasFailedPayment = payments.some((p: any) =>
    p.payment_status === 'failed' || p.internal_status === 'failed'
  );

  const riskComplete = !!risk?.RiskAssessmentResult;
  const isHighRisk = risk?.RiskAssessmentResult?.toLowerCase().includes('high');
  const isMediumRisk = risk?.RiskAssessmentResult?.toLowerCase().includes('medium');
  const riskLevel = isHighRisk ? 'High' : isMediumRisk ? 'Medium'
    : risk?.RiskAssessmentResult?.toLowerCase().includes('low') ? 'Low' : null;

  const hasMatter = !!(instruction?.MatterId || instruction?.MatterRef || matters.length > 0);
  const matterDisplayId = instruction?.DisplayNumber
    || instruction?.['Display Number']
    || instruction?.MatterRef
    || (matters.length > 0
      ? (matters[0]?.['Display Number'] || matters[0]?.DisplayNumber || matters[0]?.displayNumber || matters[0]?.display_number || matters[0]?.MatterRef || matters[0]?.id)
      : null);
  const hasCcl = Boolean(matterDisplayId && item?.matter?.cclDate);
  const hasCclDraft = Boolean(item?.matter?.hasCclDraft);
  const hasDocs = documents.length > 0;
  const docCount = documents.length;

  const hasEnquiry = !!matchedEnquiry;
  const hasPitch = Boolean(instructedDate); // If instructed, pitch happened

  const identityStatus = stageStatuses?.id || (
    eidStatus === 'verified' || eidStatus === 'completed' || eidStatus === 'skipped'
      ? 'complete'
      : eidStatus === 'failed' || eidStatus === 'review'
      ? 'review'
      : 'pending'
  );
  const paymentStatus = stageStatuses?.payment || (hasSuccessfulPayment ? 'complete' : hasFailedPayment ? 'review' : 'pending');
  const riskStatus = stageStatuses?.risk || (riskComplete ? ((isHighRisk || isMediumRisk) ? 'review' : 'complete') : 'pending');
  const matterStageStatus = stageStatuses?.matter || (hasMatter ? 'complete' : 'pending');
  const cclStageStatus = hasCcl ? 'complete' : hasCclDraft ? 'review' : hasMatter ? 'current' : 'disabled';
  const documentStatus = stageStatuses?.documents || (hasDocs ? 'complete' : 'neutral');

  const instructionDate = instructedDate ? new Date(instructedDate) : null;

  // Full 8-stage pipeline — exact same shape as EnquiryTimeline
  const stages: Array<{
    key: string;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    status: 'complete' | 'current' | 'review' | 'pending' | 'processing' | 'neutral' | 'disabled';
    date: Date | null;
    detail?: string;
  }> = [
    {
      key: 'enquiry',
      label: 'Enquiry',
      shortLabel: 'Enquiry',
      icon: <FaUser size={10} />,
      status: hasEnquiry ? 'complete' : 'pending',
      date: null,
    },
    {
      key: 'pitch',
      label: 'Pitched',
      shortLabel: 'Pitched',
      icon: <FaCheckCircle size={10} />,
      status: hasPitch ? 'complete' : 'current',
      date: null,
    },
    {
      key: 'instructed',
      label: hasInstructionActivity ? 'Instructed' : 'Instruction',
      shortLabel: hasInstructionActivity ? 'Instructed' : 'Instruction',
      icon: <FaClipboard size={10} />,
      status: hasInstruction ? 'complete' : (hasInstructionActivity ? 'current' : 'disabled'),
      date: instructionDate,
    },
    {
      key: 'id',
      label: eidDisplayResult ? `ID: ${eidDisplayResult}` : 'ID Check',
      shortLabel: eidDisplayResult ? `ID: ${eidDisplayResult}` : 'ID Check',
      icon: <FaIdCard size={10} />,
      status: !hasInstruction ? 'disabled' : identityStatus as any,
      date: null,
    },
    {
      key: 'payment',
      label: hasSuccessfulPayment ? 'Paid' : 'Payment',
      shortLabel: hasSuccessfulPayment ? 'Paid' : 'Payment',
      icon: <FaPoundSign size={10} />,
      status: !hasInstruction ? 'disabled' : paymentStatus as any,
      date: null,
    },
    {
      key: 'risk',
      label: riskLevel ? `Risk: ${riskLevel}` : 'Risk',
      shortLabel: riskLevel ? `Risk: ${riskLevel}` : 'Risk',
      icon: <FaShieldAlt size={10} />,
      status: !hasInstruction ? 'disabled' : riskStatus as any,
      date: null,
    },
    {
      key: 'matter',
      label: matterDisplayId ? String(matterDisplayId) : 'Matter',
      shortLabel: matterDisplayId ? String(matterDisplayId) : 'Matter',
      icon: <FaFolderOpen size={10} />,
      status: !hasInstruction ? 'disabled' : matterStageStatus as any,
      date: null,
    },
    {
      key: 'documents',
      label: 'Docs',
      shortLabel: 'Docs',
      icon: <FaFileAlt size={10} />,
      status: !hasInstruction ? 'disabled' : documentStatus as any,
      date: null,
      detail: docCount > 0 ? String(docCount) : undefined,
    },
    {
      key: 'ccl',
      label: hasCcl ? 'CCL Sent' : hasCclDraft ? 'CCL Generated' : 'CCL',
      shortLabel: 'CCL',
      icon: <FaFileAlt size={10} />,
      status: !hasInstruction ? 'disabled' : cclStageStatus as any,
      date: null,
    },
  ];

  const visibleStages = canSeeCcl ? stages : stages.filter((s) => s.key !== 'ccl');

  const stageTabs = visibleStages.map((stage) => {
    const isCompleted = stage.status === 'complete';
    const isCurrent = stage.status === 'current';
    const hasIssue = stage.status === 'review';

    const statusColor = isCompleted ? colours.highlight
      : hasIssue ? (stage.key === 'risk' && isMediumRisk ? colours.orange : colours.cta)
      : isCurrent ? colours.highlight
      : (isDarkMode ? colours.subtleGrey : colours.greyText);

    const workbenchTab: WorkbenchTabKeyType = stage.key === 'id' ? 'identity'
      : stage.key === 'payment' ? 'payment'
      : stage.key === 'risk' ? 'risk'
      : stage.key === 'matter' ? 'matter'
      : stage.key === 'documents' ? 'documents'
      : 'details';

    const contextStage: ContextStageKeyType = stage.key === 'pitch' ? 'pitch'
      : stage.key === 'enquiry' ? 'enquiry'
      : 'instructed';

    const isContextStage = ['enquiry', 'pitch', 'instructed'].includes(stage.key);

    const isActive = stage.key === 'ccl'
      ? selectedMatterStage === 'ccl'
      : selectedContextStage
        ? (selectedContextStage === contextStage && (isContextStage || selectedWorkbenchTab === workbenchTab))
        : (selectedWorkbenchTab === workbenchTab && !isContextStage);

    return {
      ...stage,
      workbenchTab,
      contextStage,
      isActive,
      statusColor,
      hasIssue,
      toneColor: stage.key === 'risk' && isMediumRisk ? colours.orange : undefined,
    };
  });

  const displayWorkbenchHeader = stageTabs.find((stage) => stage.isActive)
    || stageTabs.find((stage) => stage.status !== 'disabled')
    || {
      icon: <FaClipboard size={10} />,
      label: 'Workbench',
      shortLabel: 'Workbench',
    };

  return (
    <>
      {/* Pipeline pill bar — identical to EnquiryTimeline TIER 3 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: isDarkMode ? colours.darkBlue : colours.grey,
          borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorkbenchJourneyRail
            stages={stageTabs.map((stage) => ({
              key: stage.key,
              label: stage.label,
              shortLabel: stage.shortLabel,
              icon: stage.icon,
              status: stage.status,
              isActive: stage.isActive,
              toneColor: stage.toneColor,
              onClick: stage.status === 'disabled'
                ? undefined
                : () => {
                    if (stage.key === 'ccl') {
                      setSelectedContextStage(null);
                      setSelectedWorkbenchTab('details');
                      setSelectedMatterStage('ccl');
                      onSelectCclStage();
                      return;
                    }

                    setSelectedMatterStage(null);

                    if (['enquiry', 'pitch', 'instructed'].includes(stage.key)) {
                      setSelectedWorkbenchTab('details');
                      if (stage.key === 'enquiry' || stage.key === 'pitch') {
                        setSelectedContextStage(stage.contextStage);
                      } else {
                        setSelectedContextStage('instructed');
                      }
                    } else {
                      setSelectedContextStage(null);
                      setSelectedWorkbenchTab(stage.workbenchTab);
                    }
                  },
            }))}
            isDarkMode={isDarkMode}
            railStyle={{
              padding: '12px 12px 12px 24px',
              background: 'transparent',
              borderBottom: 'none',
              gap: 0,
            }}
          />
        </div>
        {typeof onToggleCollapsed === 'function' && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={expanded ? 'Collapse workbench' : 'Expand workbench'}
            title={expanded ? 'Collapse workbench' : 'Expand workbench'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              marginRight: 16,
              flexShrink: 0,
              background: 'transparent',
              border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.12)'}`,
              borderRadius: 0,
              cursor: 'pointer',
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              transition: 'all 0.15s ease',
            }}
          >
            <Icon
              iconName={expanded ? 'ChevronUp' : 'ChevronDown'}
              styles={{ root: { fontSize: 12 } }}
            />
          </button>
        )}
      </div>

      {/* InlineWorkbench — pills suppressed, controlled externally */}
      {!collapsed && (
        <div className={workbenchShellStyle(isDarkMode)}>
          <div className={workbenchShellHeaderStyle(isDarkMode)}>
            <div className={workbenchShellHeaderContentStyle}>
              <span className={workbenchShellHeaderIconStyle(isDarkMode)}>
                {displayWorkbenchHeader.icon}
              </span>
              <span className={workbenchShellHeaderLabelStyle(isDarkMode)}>
                {displayWorkbenchHeader.shortLabel || displayWorkbenchHeader.label}
              </span>
            </div>
          </div>
          <div className={workbenchShellBodyStyle}>
            <InlineWorkbench
              item={{ ...derivedWorkbenchItem, enquiry: matchedEnquiry }}
              isDarkMode={isDarkMode}
              teamData={teamData}
              initialTab={selectedWorkbenchTab}
              initialContextStage={selectedContextStage}
              enableContextStageChips={false}
              enableTabStages={false}
              contextStageKeys={['enquiry', 'pitch', 'instructed']}
              demoModeEnabled={demoModeEnabled}
              flatEmbedMode={true}
            />
          </div>
        </div>
      )}
    </>
  );
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */

const MatterOverview: React.FC<MatterOverviewProps> = ({
  matter,
  userInitials,
  activeTab,
  overviewData,
  outstandingData,
  wipStatus = 'idle',
  fundsStatus = 'idle',
  outstandingStatus = 'idle',
  auditEnabled = false,
  auditStatus = 'idle',
  auditData,
  onToggleAudit = () => {},
  workbenchItem,
  enquiries,
  teamData,
  demoModeEnabled = false,
  autoOpenCcl = false,
  onCclOpened,
}) => {
  const { isDarkMode } = useTheme();
  const [copiedContact, setCopiedContact] = React.useState<'email' | 'phone' | null>(null);
  const [clioClientStatus, setClioClientStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [clioClient, setClioClient] = React.useState<any | null>(null);
  const [showCCLEditor, setShowCCLEditor] = React.useState(false);
  const cclSectionRef = React.useRef<HTMLDivElement | null>(null);
  const [hasCclDraft, setHasCclDraft] = React.useState(false);
  const [cclDraftPreview, setCclDraftPreview] = React.useState('');
  const [cclDraftFields, setCclDraftFields] = React.useState<Record<string, string>>({});
  const [showCclDraftPreview, setShowCclDraftPreview] = React.useState(false);
  const [isCclDraftLoading, setIsCclDraftLoading] = React.useState(false);
  const [cclServiceSummary, setCclServiceSummary] = React.useState<MatterCclServiceSummary>({
    stage: matter.cclDate ? 'sent' : 'pending',
    label: matter.cclDate ? 'Sent' : 'Pending',
    needsAttention: false,
  });
  const [netDocumentsWorkspaceLoading, setNetDocumentsWorkspaceLoading] = React.useState(false);
  const [netDocumentsWorkspaceError, setNetDocumentsWorkspaceError] = React.useState<string | null>(null);
  const [netDocumentsWorkspace, setNetDocumentsWorkspace] = React.useState<MatterNetDocumentsWorkspaceResult | null>(null);
  const [netDocumentsItems, setNetDocumentsItems] = React.useState<MatterNetDocumentsContainerItem[]>([]);
  const [netDocumentsBreadcrumbs, setNetDocumentsBreadcrumbs] = React.useState<MatterNetDocumentsBreadcrumb[]>([]);
  const [clioActivitiesStatus, setClioActivitiesStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [clioActivities, setClioActivities] = React.useState<ClioMatterActivity[]>([]);
  const [clioActivitiesVisibleCount, setClioActivitiesVisibleCount] = React.useState(5);
  const [expandedDetailSections, setExpandedDetailSections] = React.useState<Record<DetailSectionKey, boolean>>({
    matter: false,
    activities: true,
    custom: false,
    assignments: false,
  });
  const [detailViewMode, setDetailViewMode] = React.useState<DetailViewMode>('all');
  const rawWorkbenchMatter = Array.isArray(workbenchItem?.matters)
    ? workbenchItem.matters[0]
    : null;
  const resolvedClioMatterId = React.useMemo(() => {
    const candidates = [
      overviewData?.clioMatterId,
      rawWorkbenchMatter?.MatterId,
      rawWorkbenchMatter?.MatterID,
      rawWorkbenchMatter?.id,
      matter.matterId,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }

    return '';
  }, [matter.matterId, overviewData?.clioMatterId, rawWorkbenchMatter]);

  // Auto-open CCL editor when arriving from matter opening with showCcl flag
  React.useEffect(() => {
    if (autoOpenCcl && !showCCLEditor) {
      setShowCCLEditor(true);
      onCclOpened?.();
    }
  }, [autoOpenCcl, onCclOpened, showCCLEditor]);

  React.useEffect(() => {
    const matterId = matter.matterId;
    if (!matterId) {
      setCclServiceSummary({
        stage: matter.cclDate ? 'sent' : 'pending',
        label: matter.cclDate ? 'Sent' : 'Pending',
        needsAttention: false,
      });
      return;
    }

    let cancelled = false;

    fetch('/api/ccl/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterIds: [matterId] }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Failed to load CCL status'))))
      .then((data) => {
        if (cancelled) {
          return;
        }

        const result = data?.results?.[matterId];
        const stage = typeof result?.stage === 'string' && result.stage.trim()
          ? result.stage.trim().toLowerCase()
          : (matter.cclDate ? 'sent' : 'pending');

        setCclServiceSummary({
          stage,
          label: typeof result?.label === 'string' && result.label.trim() ? result.label.trim() : getMatterCclLabel(stage),
          needsAttention: Boolean(result?.needsAttention),
          confidence: typeof result?.confidence === 'string' ? result.confidence : null,
          attentionReason: typeof result?.attentionReason === 'string' ? result.attentionReason : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCclServiceSummary({
            stage: matter.cclDate ? 'sent' : 'pending',
            label: matter.cclDate ? 'Sent' : 'Pending',
            needsAttention: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matter.cclDate, matter.matterId]);

  React.useEffect(() => {
    const matterKey = matter.matterId || matter.displayNumber;
    if (!matterKey) {
      setHasCclDraft(false);
      setCclDraftPreview('');
      setCclDraftFields({});
      setShowCclDraftPreview(false);
      return;
    }

    let cancelled = false;
    setIsCclDraftLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/ccl/${encodeURIComponent(String(matterKey))}`);
        if (!response.ok) throw new Error('Failed to load CCL draft state');

        const data = await response.json();
        const draft = data?.json;
        const hasDraft = Boolean(draft && typeof draft === 'object' && Object.keys(draft).length > 0);
        const preview = hasDraft
          ? String(
              draft.insert_heading_eg_matter_description ||
              draft.matter_details?.description ||
              draft.matter ||
              draft.identify_the_other_party_eg_your_opponents ||
              ''
            ).trim()
          : '';

        if (!cancelled) {
          setHasCclDraft(hasDraft);
          setCclDraftPreview(preview);
          setCclDraftFields(hasDraft ? draft : {});
          setShowCclDraftPreview(hasDraft);
        }
      } catch {
        if (!cancelled) {
          setHasCclDraft(false);
          setCclDraftPreview('');
          setCclDraftFields({});
          setShowCclDraftPreview(false);
        }
      } finally {
        if (!cancelled) {
          setIsCclDraftLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matter.matterId, matter.displayNumber, showCCLEditor]);

  React.useEffect(() => {
    if (!resolvedClioMatterId) {
      setClioActivities([]);
      setClioActivitiesStatus('idle');
      return;
    }

    let cancelled = false;
    setClioActivitiesStatus('loading');
    setClioActivitiesVisibleCount(5);

    (async () => {
      const payload = await callGetMatterSpecificActivities({
        matterId: resolvedClioMatterId,
        displayNumber: matter.displayNumber ? String(matter.displayNumber) : undefined,
        instructionRef: matter.instructionRef ? String(matter.instructionRef) : undefined,
        initials: userInitials ? String(userInitials) : undefined,
      });
      if (cancelled) return;

      const items = payload && Array.isArray(payload.data) ? payload.data : [];
      items.sort((left, right) => {
        const leftDate = new Date(String(left.date || left.created_at || '')).getTime();
        const rightDate = new Date(String(right.date || right.created_at || '')).getTime();
        return rightDate - leftDate;
      });

      setClioActivities(items);
      setClioActivitiesStatus(payload ? 'ready' : 'error');
    })().catch(() => {
      if (!cancelled) {
        setClioActivities([]);
        setClioActivitiesStatus('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [matter.displayNumber, matter.instructionRef, resolvedClioMatterId, userInitials]);

  const netDocumentsClientId = String(matter.clientId || '').trim();
  const netDocumentsMatterKey = String(matter.displayNumber || matter.matterId || '').trim();

  const loadNetDocumentsFolder = React.useCallback(async (
    folderId: string,
    nextBreadcrumbs?: MatterNetDocumentsBreadcrumb[],
  ) => {
    const trimmedFolderId = String(folderId || '').trim();
    if (!trimmedFolderId) return;

    setNetDocumentsWorkspaceLoading(true);
    setNetDocumentsWorkspaceError(null);

    try {
      const response = await fetch(`/api/resources/core/netdocuments-folder-contents/${encodeURIComponent(trimmedFolderId)}`);
      const payload = await response.json();
      if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments folder lookup failed.');

      setNetDocumentsItems(payload.result?.items || []);
      if (nextBreadcrumbs) {
        setNetDocumentsBreadcrumbs(nextBreadcrumbs);
      }
    } catch (error) {
      setNetDocumentsWorkspaceError((error as Error).message || 'NetDocuments folder lookup failed.');
      setNetDocumentsItems([]);
    } finally {
      setNetDocumentsWorkspaceLoading(false);
    }
  }, []);

  const loadNetDocumentsWorkspace = React.useCallback(async (clientId: string, matterKey: string) => {
    const trimmedClientId = String(clientId || '').trim();
    const trimmedMatterKey = String(matterKey || '').trim();
    if (!trimmedClientId || !trimmedMatterKey) {
      setNetDocumentsWorkspace(null);
      setNetDocumentsItems([]);
      setNetDocumentsBreadcrumbs([]);
      setNetDocumentsWorkspaceError(null);
      return;
    }

    setNetDocumentsWorkspaceLoading(true);
    setNetDocumentsWorkspaceError(null);
    setNetDocumentsWorkspace(null);
    setNetDocumentsItems([]);
    setNetDocumentsBreadcrumbs([]);

    try {
      const workspaceResponse = await fetch(
        `/api/resources/core/netdocuments-workspace?q=${encodeURIComponent(`${trimmedClientId}/${trimmedMatterKey}`)}`,
      );
      const workspacePayload = await workspaceResponse.json();
      if (!workspacePayload?.ok) throw new Error(workspacePayload?.error || 'NetDocuments lookup failed.');

      const workspaceResult = workspacePayload.result || null;
      setNetDocumentsWorkspace(workspaceResult);
      setNetDocumentsBreadcrumbs([
        {
          id: workspaceResult?.id || `${trimmedClientId}/${trimmedMatterKey}`,
          name: workspaceResult?.name || `${trimmedClientId}/${trimmedMatterKey}`,
          type: 'workspace',
        },
      ]);

      const params = new URLSearchParams({ clientId: trimmedClientId, matterKey: trimmedMatterKey });
      const contentsResponse = await fetch(`/api/resources/core/netdocuments-workspace-contents?${params.toString()}`);
      const contentsPayload = await contentsResponse.json();
      if (!contentsPayload?.ok) throw new Error(contentsPayload?.error || 'NetDocuments workspace contents lookup failed.');

      setNetDocumentsItems(contentsPayload.result?.items || []);
    } catch (error) {
      setNetDocumentsWorkspaceError((error as Error).message || 'NetDocuments lookup failed.');
      setNetDocumentsWorkspace(null);
      setNetDocumentsItems([]);
      setNetDocumentsBreadcrumbs([]);
    } finally {
      setNetDocumentsWorkspaceLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadNetDocumentsWorkspace(netDocumentsClientId, netDocumentsMatterKey);
  }, [loadNetDocumentsWorkspace, netDocumentsClientId, netDocumentsMatterKey]);

  const handleNetDocumentsBreadcrumbClick = React.useCallback((index: number) => {
    const crumb = netDocumentsBreadcrumbs[index];
    if (!crumb) return;

    const nextBreadcrumbs = netDocumentsBreadcrumbs.slice(0, index + 1);
    if (crumb.type === 'workspace') {
      void loadNetDocumentsWorkspace(netDocumentsClientId, netDocumentsMatterKey);
      return;
    }

    void loadNetDocumentsFolder(crumb.id, nextBreadcrumbs);
  }, [loadNetDocumentsFolder, loadNetDocumentsWorkspace, netDocumentsBreadcrumbs, netDocumentsClientId, netDocumentsMatterKey]);

  const handleNetDocumentsOpenFolder = React.useCallback((item: MatterNetDocumentsContainerItem) => {
    const folderId = String(item.id || '').trim();
    if (!folderId) return;

    void loadNetDocumentsFolder(folderId, [
      ...netDocumentsBreadcrumbs,
      {
        id: folderId,
        name: item.name || 'Folder',
        type: 'folder',
      },
    ]);
  }, [loadNetDocumentsFolder, netDocumentsBreadcrumbs]);

  // ─── Pipeline pill bar state (mirrors EnquiryTimeline) ───
  type WorkbenchTabKey = 'details' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents';
  type ContextStageKey = 'enquiry' | 'pitch' | 'instructed';
  const [selectedWorkbenchTab, setSelectedWorkbenchTab] = useState<WorkbenchTabKey>('details');
  const [selectedContextStage, setSelectedContextStage] = useState<ContextStageKey | null>('enquiry');
  const [selectedMatterStage, setSelectedMatterStage] = useState<'ccl' | null>(null);
  const [workbenchExpanded, setWorkbenchExpanded] = useState(false);

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const hasWiredDetailData = Boolean(overviewData || outstandingData);

  const isWipLoading = wipStatus === 'loading';
  const isWipReady = wipStatus === 'ready';
  const isFundsLoading = fundsStatus === 'loading';
  const isOutstandingLoading = outstandingStatus === 'loading';

  const handleCopy = React.useCallback(async (value: string, key: 'email' | 'phone') => {
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-1000px';
        textarea.style.top = '-1000px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedContact(key);
      window.setTimeout(() => {
        setCopiedContact((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      // silent fail
    }
  }, []);

  const getPipelineValue = (fields: string[], fallback = ''): string => {
    const sources = [pipelineInstruction, pipelinePrimaryClient, pipelineDeal];
    for (const field of fields) {
      for (const source of sources) {
        const value = source?.[field as keyof typeof source] as unknown;
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim().length === 0) continue;
        return String(value);
      }
    }
    return fallback;
  };

  const pipelineLink = parseInstructionRef(matter.instructionRef);
  const isPipelineLinked = matter.dataSource === 'vnet_direct' && Boolean(pipelineLink.instructionRef);
  const isLegacyMatter = !isPipelineLinked;

  const fetchClioClient = React.useCallback(async () => {
    if (!matter.clientId || !userInitials) return;
    setClioClientStatus('loading');
    try {
      const resp = await fetch(`/api/clio-client-query/${encodeURIComponent(String(matter.clientId))}/${encodeURIComponent(userInitials)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const client = data?.client || null;
      setClioClient(client);
      setClioClientStatus(client ? 'ready' : 'error');
    } catch {
      setClioClient(null);
      setClioClientStatus('error');
    }
  }, [matter.clientId, userInitials]);

  React.useEffect(() => {
    if (!isLegacyMatter) return;
    if (!matter.clientId || !userInitials) return;
    fetchClioClient();
  }, [fetchClioClient, isLegacyMatter, matter.clientId, userInitials]);

  const baseWorkbenchItem = React.useMemo<any | null>(() => {
    if (workbenchItem) {
      return workbenchItem;
    }
    if (!pipelineLink.instructionRef) return null;

    const nameParts = (matter.clientName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    const instruction = {
      InstructionRef: pipelineLink.instructionRef,
      FirstName: firstName,
      LastName: lastName,
      Forename: firstName,
      Surname: lastName,
      ClientEmail: matter.clientEmail,
      Email: matter.clientEmail,
      ClientPhone: matter.clientPhone,
      Phone_Number: matter.clientPhone,
      AreaOfWork: matter.practiceArea,
      PracticeArea: matter.practiceArea,
      Description: matter.description,
      MatterId: matter.matterId,
      MatterID: matter.matterId,
      DisplayNumber: matter.displayNumber,
      MatterOpenDate: matter.openDate,
    };

    const deal = {
      InstructionRef: pipelineLink.instructionRef,
      ProspectId: pipelineLink.prospectId,
      Passcode: pipelineLink.passcode,
      ServiceDescription: matter.description,
      AreaOfWork: matter.practiceArea,
    };

    return {
      instruction,
      deal,
      enquiry: null,
      prospectId: pipelineLink.prospectId,
      documents: [],
      payments: [],
      risk: null,
      eid: null,
      eids: [],
      clients: matter.clientEmail
        ? [{ ClientEmail: matter.clientEmail, Lead: true }]
        : [],
      matters: matter.matterId
        ? [{ MatterId: matter.matterId, DisplayNumber: matter.displayNumber }]
        : [],
    };
  }, [workbenchItem, pipelineLink.instructionRef, pipelineLink.passcode, pipelineLink.prospectId, matter]);

  const pipelineInstruction = baseWorkbenchItem?.instruction || null;
  const pipelineDeal = baseWorkbenchItem?.deal || null;
  const pipelineClients = Array.isArray(baseWorkbenchItem?.clients)
    ? baseWorkbenchItem.clients
    : [];
  const pipelinePrimaryClient = pipelineClients[0] || null;

  // ActiveCampaign contact ID from the pipeline Deals table (ProspectId).
  // NOT the new-space internal enquiry PK — those are separate IDs.
  const enquiryProspectId = React.useMemo(() => {
    return (
      baseWorkbenchItem?.deal?.ProspectId ||
      baseWorkbenchItem?.ProspectId ||
      baseWorkbenchItem?.prospectId ||
      baseWorkbenchItem?.instruction?.ProspectId ||
      pipelineLink.prospectId ||
      null
    );
  }, [baseWorkbenchItem, pipelineLink.prospectId]);

  const [directEnquiry, setDirectEnquiry] = React.useState<Enquiry | null>(null);

  React.useEffect(() => {
    if (!isPipelineLinked) return;
    const candidateKey = normaliseId(enquiryProspectId);
    if (!candidateKey) return;
    if (enquiries?.some((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey))) return;

    let cancelled = false;
    setDirectEnquiry(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          prospectId: candidateKey,
          limit: '50',
        });
        appendDefaultEnquiryProcessingParams(params);
        const resp = await fetch(`/api/enquiries-unified?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const rawEnquiries = Array.isArray(data)
          ? data
          : (Array.isArray(data.enquiries) ? data.enquiries : []);

        const normalised = rawEnquiries.map((raw: any) => ({
          ...raw,
          ID: raw.ID || raw.id?.toString(),
          Touchpoint_Date: raw.Touchpoint_Date || raw.datetime,
          Point_of_Contact: raw.Point_of_Contact || raw.poc,
          Area_of_Work: raw.Area_of_Work || raw.aow,
          Type_of_Work: raw.Type_of_Work || raw.tow,
          Method_of_Contact: raw.Method_of_Contact || raw.moc,
          First_Name: raw.First_Name || raw.first,
          Last_Name: raw.Last_Name || raw.last,
          Email: raw.Email || raw.email,
          Phone_Number: raw.Phone_Number || raw.phone,
          Value: raw.Value || raw.value,
          Initial_first_call_notes: raw.Initial_first_call_notes || raw.notes,
          Call_Taker: raw.Call_Taker || raw.rep,
          Ultimate_Source: raw.Ultimate_Source || raw.source || null,
        })) as Enquiry[];

        // Find all matching records — prefer the one whose email matches the matter
        const matches = normalised.filter((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey));
        let found: Enquiry | null = null;
        if (matches.length > 1) {
          const matterEmail = (matter.clientEmail || '').toString().trim().toLowerCase();
          const byEmail = matterEmail
            ? matches.find((e: any) => (e.Email || e.email || '').toString().trim().toLowerCase() === matterEmail)
            : null;
          found = byEmail || matches[0];
        } else {
          found = matches[0] || null;
        }
        if (!cancelled) setDirectEnquiry(found);
      } catch {
        if (!cancelled) setDirectEnquiry(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enquiries, enquiryProspectId, isPipelineLinked]);

  const matchedEnquiry = React.useMemo<Enquiry | null>(() => {
    const enquiryList = enquiries ?? [];
    if (enquiryList.length === 0 && !directEnquiry) return null;
    const candidateKey = normaliseId(enquiryProspectId);
    if (directEnquiry && (!candidateKey || resolveEnquiryKeys(directEnquiry).includes(candidateKey))) {
      return directEnquiry;
    }
    const byId = candidateKey
      ? enquiryList.find((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey))
      : null;
    if (byId) return byId;

    const normalise = (value?: string | null) => (value || '').toString().trim().toLowerCase();
    const instructionRef = pipelineLink.instructionRef ? normalise(pipelineLink.instructionRef) : '';
    if (instructionRef) {
      const byRef = enquiryList.find((enquiry) => {
        const enquiryRecord = enquiry as any;
        const ref = normalise(
          enquiryRecord?.InstructionRef ||
          enquiryRecord?.instructionRef ||
          enquiryRecord?.Instruction_Ref ||
          enquiryRecord?.instruction_ref ||
          enquiryRecord?.Matter_Ref ||
          enquiryRecord?.matterRef ||
          enquiryRecord?.matter_ref
        );
        return ref !== '' && ref === instructionRef;
      });
      if (byRef) return byRef as Enquiry;
    }

    const email = normalise(
      matter.clientEmail ||
      pipelineInstruction?.Email ||
      pipelineInstruction?.ClientEmail ||
      pipelinePrimaryClient?.ClientEmail ||
      pipelinePrimaryClient?.Email
    );
    if (email) {
      const matches = enquiryList.filter((enquiry) => {
        const enquiryRecord = enquiry as any;
        const enquiryEmail = normalise(enquiryRecord?.Email || enquiryRecord?.email || enquiryRecord?.ClientEmail);
        return enquiryEmail && enquiryEmail === email;
      });
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        const firstName = normalise(matter.clientName?.split(/\s+/)[0] || pipelineInstruction?.FirstName || pipelineInstruction?.Forename);
        const lastName = normalise(matter.clientName?.split(/\s+/).slice(1).join(' ') || pipelineInstruction?.LastName || pipelineInstruction?.Surname);
        const byName = matches.find((enquiry) => {
          const enquiryRecord = enquiry as any;
          const enquiryFirst = normalise(enquiryRecord?.First_Name || enquiryRecord?.first || enquiryRecord?.FirstName);
          const enquiryLast = normalise(enquiryRecord?.Last_Name || enquiryRecord?.last || enquiryRecord?.LastName);
          return (!firstName || enquiryFirst === firstName) && (!lastName || enquiryLast === lastName);
        });
        if (byName) return byName;
        const withNotes = matches.find((enquiry) => {
          const enquiryRecord = enquiry as any;
          return String(enquiryRecord?.Initial_first_call_notes || enquiryRecord?.notes || '').trim().length > 0;
        });
        if (withNotes) return withNotes;
        return matches[0];
      }
    }

    return null;
  }, [baseWorkbenchItem, directEnquiry, enquiries, enquiryProspectId, matter.clientEmail, matter.clientName, pipelineInstruction, pipelineLink.instructionRef, pipelineLink.prospectId, pipelinePrimaryClient]);

  const derivedWorkbenchItem = React.useMemo<any | null>(() => {
    if (!baseWorkbenchItem) return null;
    return matchedEnquiry
      ? { ...baseWorkbenchItem, enquiry: matchedEnquiry }
      : baseWorkbenchItem;
  }, [baseWorkbenchItem, matchedEnquiry]);

  // ActiveCampaign contact ID from the matched enquiry.
  // New-space records: stored in the `acid` column (may be null if enquiry didn't come via AC).
  // Legacy records: the `acid` column is not selected by the unified query, so it's undefined.
  // We do NOT fall back to ID/id — those are internal PKs and only coincidentally
  // matched the AC contact ID for some legacy records. Showing the wrong ID is worse
  // than showing nothing.
  const enquiryAcid = React.useMemo(() => {
    const enquiryRecord = matchedEnquiry as Record<string, unknown> | null;
    if (!enquiryRecord) return null;
    const acId =
      enquiryRecord.acid ||
      enquiryRecord.ACID ||
      enquiryRecord.Acid ||
      null;
    return acId ? String(acId) : null;
  }, [matchedEnquiry]);

  // Internal enquiry PK — new-space `id` or legacy `ID`.
  // Distinct from ACID: new-space records have their own auto-increment PK
  // that is NOT the ActiveCampaign contact ID.
  const enquiryInternalId = React.useMemo(() => {
    const enquiryRecord = matchedEnquiry as Record<string, unknown> | null;
    if (!enquiryRecord) return null;
    const candidate = enquiryRecord.id || enquiryRecord.ID || null;
    return candidate ? String(candidate) : null;
  }, [matchedEnquiry]);

  const pipelineName = (() => {
    const first = pipelineInstruction?.FirstName || pipelineInstruction?.Forename || pipelineInstruction?.first_name || '';
    const last = pipelineInstruction?.LastName || pipelineInstruction?.Surname || pipelineInstruction?.last_name || '';
    const combined = `${first} ${last}`.trim();
    return combined || pipelineInstruction?.ClientName || pipelineInstruction?.client_name || '';
  })();

  const pipelineTitle = getPipelineValue(['Title', 'title', 'Salutation', 'ClientTitle']);
  const pipelineGender = getPipelineValue(['Gender', 'gender', 'Sex', 'sex']);
  const pipelineNationality = getPipelineValue(['Nationality', 'nationality']);
  const pipelineDobRaw = getPipelineValue(['DateOfBirth', 'dateOfBirth', 'DOB']);
  const pipelineDob = formatLongDate(pipelineDobRaw || undefined);
  const pipelineAge = React.useMemo(() => {
    if (!pipelineDobRaw) return '—';
    const parsed = new Date(pipelineDobRaw);
    if (Number.isNaN(parsed.getTime())) return '—';
    const diff = Date.now() - parsed.getTime();
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return Number.isFinite(years) ? String(years) : '—';
  }, [pipelineDobRaw]);

  const pipelineHouseNum = getPipelineValue(['HouseNumber', 'houseNumber'], '');
  const pipelineStreet = getPipelineValue(['Street', 'street'], '');
  const pipelineStreetFull = `${pipelineHouseNum} ${pipelineStreet}`.trim();
  const pipelineCity = getPipelineValue(['City', 'city', 'Town'], '');
  const pipelineCounty = getPipelineValue(['County', 'county'], '');
  const pipelinePostcode = getPipelineValue(['Postcode', 'postcode', 'PostCode'], '');
  const pipelineCountry = getPipelineValue(['Country', 'country'], '');

  const pipelineCompanyName = getPipelineValue(['CompanyName', 'Company', 'company']);
  const pipelineCompanyNo = getPipelineValue(['CompanyNumber', 'companyNumber', 'CompanyNo']);
  const pipelineCompanyCountry = getPipelineValue(['CompanyCountry', 'companyCountry']);
  const pipelineCompanyHouseNum = getPipelineValue(['CompanyHouseNumber', 'companyHouseNumber'], '');
  const pipelineCompanyStreet = getPipelineValue(['CompanyStreet', 'companyStreet'], '');
  const pipelineCompanyStreetFull = `${pipelineCompanyHouseNum} ${pipelineCompanyStreet}`.trim();
  const pipelineCompanyCity = getPipelineValue(['CompanyCity', 'companyCity'], '');
  const pipelineCompanyCounty = getPipelineValue(['CompanyCounty', 'companyCounty'], '');
  const pipelineCompanyPostcode = getPipelineValue(['CompanyPostcode', 'companyPostcode'], '');
  const pipelineClientType = getPipelineValue(['ClientType', 'clientType', 'Client_Type', 'Type']);
  const isPipelineCompany =
    Boolean(pipelineCompanyName) || pipelineClientType.toLowerCase() === 'company';

  const pipelineEmail =
    pipelineInstruction?.ClientEmail ||
    pipelineInstruction?.Email ||
    pipelinePrimaryClient?.ClientEmail ||
    pipelinePrimaryClient?.email ||
    '';

  const pipelinePhone =
    pipelineInstruction?.ClientPhone ||
    pipelineInstruction?.Phone_Number ||
    pipelineInstruction?.Phone ||
    pipelinePrimaryClient?.ClientPhone ||
    pipelinePrimaryClient?.phone ||
    '';

  const clioClientName =
    clioClient?.name ||
    clioClient?.company?.name ||
    `${clioClient?.first_name || ''} ${clioClient?.last_name || ''}`.trim();
  const clioEmail =
    clioClient?.primary_email_address ||
    clioClient?.email_addresses?.find((e: any) => e?.default_email)?.address ||
    clioClient?.email_addresses?.[0]?.address ||
    '';
  const clioPhone =
    clioClient?.primary_phone_number ||
    clioClient?.phone_numbers?.find((p: any) => p?.default_number)?.number ||
    clioClient?.phone_numbers?.[0]?.number ||
    '';
  const clioDob = clioClient?.date_of_birth || '';
  const clioAddress = clioClient?.addresses?.[0] || null;
  const clioAddressText = clioAddress
    ? formatAddress([
        clioAddress?.street,
        clioAddress?.city,
        clioAddress?.province,
        clioAddress?.postal_code,
        clioAddress?.country,
      ])
    : '—';
  const clioType = clioClient?.type || '';
  const hasClioClient = isLegacyMatter && clioClientStatus === 'ready' && clioClient;

  const displayClientName = isPipelineLinked && pipelineName
    ? pipelineName
    : hasClioClient
      ? clioClientName || matter.clientName
      : matter.clientName;
  const displayClientEmail = isPipelineLinked && pipelineEmail
    ? pipelineEmail
    : hasClioClient
      ? clioEmail || matter.clientEmail
      : matter.clientEmail;
  const displayClientPhone = isPipelineLinked && pipelinePhone
    ? pipelinePhone
    : hasClioClient
      ? clioPhone || matter.clientPhone
      : matter.clientPhone;
  const displayCompanyName = isPipelineLinked && isPipelineCompany
    ? pipelineCompanyName || displayClientName
    : '';
  const displayPrimaryName = displayCompanyName || displayClientName;
  const displayContactName = isPipelineLinked && isPipelineCompany
    ? pipelineName || displayClientName
    : '';
  const displayContactLabel = displayCompanyName
    ? (pipelineTitle ? `${pipelineTitle} ${fmt(displayContactName)}` : fmt(displayContactName))
    : '';
  const displayPersonAddress = isPipelineLinked
    ? formatAddress([
        pipelineStreetFull || pipelineStreet,
        pipelineCity,
        pipelineCounty,
        pipelinePostcode,
        pipelineCountry,
      ])
    : hasClioClient
      ? clioAddressText
      : '—';
  const displayCompanyAddress = isPipelineLinked && isPipelineCompany
    ? formatAddress([
        pipelineCompanyStreetFull || pipelineCompanyStreet,
        pipelineCompanyCity,
        pipelineCompanyCounty,
        pipelineCompanyPostcode,
        pipelineCompanyCountry || pipelineCountry,
      ])
    : '—';

  // Derived metrics
  const billableAmount = safeNumber(get(overviewData, 'billableAmount'));
  const billableHours = safeNumber(get(overviewData, 'billableHours'));
  const nonBillableAmount = safeNumber(get(overviewData, 'nonBillableAmount'));
  const nonBillableHours = safeNumber(get(overviewData, 'nonBillableHours'));
  const outstandingBalance = safeNumber(
    get(outstandingData, 'total_outstanding_balance') ??
      get(outstandingData, 'due') ??
      get(outstandingData, 'balance')
  );
  const clientFunds = safeNumber(get(overviewData, 'clientFunds'));
  const totalAmount = billableAmount + nonBillableAmount;
  const billablePct = totalAmount > 0 ? Math.round((billableAmount / totalAmount) * 100) : 0;
  const totalHours = billableHours + nonBillableHours;

  const workbenchMatter = Array.isArray(derivedWorkbenchItem?.matters)
    ? derivedWorkbenchItem.matters[0]
    : null;
  const workbenchMatterId =
    workbenchMatter?.MatterId || workbenchMatter?.MatterID || workbenchMatter?.id || null;
  const workbenchDisplayNumber =
    workbenchMatter?.DisplayNumber || workbenchMatter?.display_number || workbenchMatter?.displayNumber || null;
  const headerDisplayNumber = workbenchDisplayNumber || matter.displayNumber || matter.instructionRef || matter.matterId;
  const headerClientName = displayPrimaryName || matter.clientName;

  const clioUrl = (() => {
    const dn = headerDisplayNumber;
    return dn && dn !== '—'
      ? `https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(dn)}`
      : undefined;
  })();
  const isMatterRequest = (matter.originalStatus || '').toLowerCase() === 'matterrequest';
  const auditAllowed = matter.dataSource === 'vnet_direct';
  const auditFields = Array.isArray(auditData?.fields) ? auditData.fields : [];
  const auditUnlinked = auditData?.status === 'unlinked';
  const auditHasMismatch = auditFields.some((field: any) => field?.status === 'mismatch');
  const kpiLabelRowStyle = {
    display: 'block',
    width: '100%',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    lineHeight: 1.1,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
  };
  const kpiValueRowStyle = {
    display: 'block',
    width: '100%',
    marginTop: 1,
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1.1,
    fontFamily: 'Raleway, sans-serif',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  };
  const kpiSubRowStyle = {
    display: 'block',
    width: '100%',
    fontSize: 10,
    fontWeight: 500,
    lineHeight: 1.2,
    color: isDarkMode ? '#9ca3af' : colours.greyText,
  };

  const isAdmin = !!(userInitials && ADMIN_USERS.includes(userInitials.toUpperCase().trim() as any));
  const canSeeCcl = isCclUser(userInitials);
  const showNextSteps = isAdmin && !showCCLEditor;
  const [isPortalLaunchOpen, setIsPortalLaunchOpen] = useState(false);
  const instructionPayments = Array.isArray(derivedWorkbenchItem?.payments)
    ? derivedWorkbenchItem.payments
    : [];
  const instructionPaymentReceived = instructionPayments.some((payment: any) =>
    payment?.payment_status === 'succeeded' || payment?.payment_status === 'confirmed'
  );

  // Portal URL computation
  const portalBaseUrl = 'https://instruct.helix-law.com/pitch';
  const isDemoMatter = matter.instructionRef === 'HLX-27367-94842';
  const portalUrl = isDemoMatter
    ? 'https://instruct.helix-law.com/pitch/luke-portal'
    : pipelineLink.passcode ? `${portalBaseUrl}/${pipelineLink.passcode}` : null;
  const portalLaunchModel = useMemo(() => buildPortalLaunchModel({
    passcode: pipelineLink.passcode,
    instructionRef: pipelineLink.instructionRef || matter.instructionRef,
    matterRef: matter.displayNumber || matter.matterId,
    hasInstruction: Boolean(pipelineLink.instructionRef || matter.instructionRef),
    hasMatter: true,
    absoluteUrl: portalUrl,
    entryLabel: 'Matters → Client destination',
  }), [matter.displayNumber, matter.instructionRef, matter.matterId, pipelineLink.instructionRef, pipelineLink.passcode, portalUrl]);
  const hasCcl = Boolean(matter.cclDate);
  const cclStage = cclServiceSummary.stage;
  const cclStatusLabel = cclServiceSummary.label;
  const cclIsGenerated = cclStage === 'generated';
  const cclIsReviewed = cclStage === 'reviewed';
  const cclIsSent = cclStage === 'sent';
  const riskAssessmentResult = derivedWorkbenchItem?.risk?.RiskAssessmentResult || '';
  const normalizedRiskResult = String(riskAssessmentResult).trim().toLowerCase();
  const riskLabel = hasMeaningfulValue(riskAssessmentResult) ? fmt(riskAssessmentResult) : 'Not assessed';
  const practiceAreaLabel = formatDetailText(matter.practiceArea);
  const matterDescription = formatDetailText(matter.description);
  const instructionLabel = formatDetailText(matter.instructionRef);
  const matterRefLabel = formatDetailText(headerDisplayNumber);
  const openDateLabel = formatDetailDate(matter.openDate);
  const closeDateLabel = formatDetailDate(matter.closeDate);
  const valueLabel = formatMatterAmount(matter.value);
  const opponentLabel = formatDetailText(matter.opponent);
  const opponentSolicitorLabel = formatDetailText(matter.opponentSolicitor);
  const teamMembers = [
    {
      role: 'Responsible Solicitor',
      name: matter.responsibleSolicitor,
      color: colours.highlight,
    },
    {
      role: 'Originating Solicitor',
      name: matter.originatingSolicitor,
      color: colours.missedBlue,
    },
    {
      role: 'Supervising Partner',
      name: matter.supervisingPartner,
      color: colours.accent,
    },
  ].map((member) => ({
    ...member,
    assigned: hasMeaningfulValue(member.name),
  }));
  const matterStatusLabel = matter.status === 'active' ? 'Active' : 'Closed';
  const lifecycleLabel = closeDateLabel !== 'Not set'
    ? `Opened ${openDateLabel} · Closed ${closeDateLabel}`
    : `Opened ${openDateLabel}`;

  const matterRecordFields: MatterDetailField[] = [
    { label: 'Matter Ref', value: matterRefLabel, meta: '' },
    { label: 'Instruction', value: instructionLabel, meta: '' },
    { label: 'Practice Area', value: practiceAreaLabel, meta: '' },
    { label: 'Status', value: matterStatusLabel, meta: lifecycleLabel },
    { label: 'Value', value: valueLabel, meta: '' },
    { label: 'Risk', value: riskLabel, meta: '' },
    { label: 'Opponent', value: opponentLabel, meta: hasMeaningfulValue(opponentSolicitorLabel) ? `Solicitor: ${opponentSolicitorLabel}` : '' },
    { label: 'Description', value: matterDescription, meta: '' },
  ].filter(field => hasMeaningfulValue(field.value));

  const clioCustomFields: MatterClioCustomField[] = (Array.isArray(clioClient?.custom_field_values) ? clioClient.custom_field_values : [])
    .map((field: any, index: number) => ({
      key: `${field?.id || field?.field_name || 'custom'}-${index}`,
      label: formatDetailText(field?.field_name, 'Custom Field'),
      value: Array.isArray(field?.value)
        ? field.value.filter((entry: any) => hasMeaningfulValue(entry)).map((entry: any) => fmt(String(entry))).join(', ')
        : formatDetailText(field?.value, ''),
    }))
    .filter((field: MatterClioCustomField) => hasMeaningfulValue(field.value));

  const assignmentFields: MatterDetailField[] = teamMembers.map(member => ({
    label: member.role,
    value: formatDetailText(member.name),
    meta: '',
  }));
  const visibleClioActivities = clioActivities.slice(0, clioActivitiesVisibleCount);
  const clioActivitiesPageCount = Math.max(1, Math.ceil(clioActivities.length / 5));
  const clioActivitiesCurrentPage = Math.max(1, Math.ceil(visibleClioActivities.length / 5));
  const sortedNetDocumentsItems = React.useMemo(
    () => [...netDocumentsItems].sort((left, right) => {
      const leftRank = left.type === 'container' ? 0 : 1;
      const rightRank = right.type === 'container' ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return String(left.name || '').localeCompare(String(right.name || ''));
    }),
    [netDocumentsItems],
  );

  const toggleDetailSection = (section: DetailSectionKey) => {
    setExpandedDetailSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const detailTextBaseStyle: React.CSSProperties = {
    display: 'block',
    position: 'static',
    margin: 0,
    width: '100%',
    minWidth: 0,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  };

  const detailSectionTitleTextStyle: React.CSSProperties = {
    ...detailTextBaseStyle,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  };

  const detailKickerTextStyle: React.CSSProperties = {
    ...detailTextBaseStyle,
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1.35,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
  };

  const detailValueTextStyle: React.CSSProperties = {
    ...detailTextBaseStyle,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
    color: isDarkMode ? colours.dark.text : colours.light.text,
  };

  const detailMetaTextStyle: React.CSSProperties = {
    ...detailTextBaseStyle,
    fontSize: 11,
    lineHeight: 1.45,
    color: isDarkMode ? '#9ca3af' : colours.greyText,
  };

  const sectionToggleButtonStyle: React.CSSProperties = {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const sectionToggleLeftStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flex: 1,
  };

  const sectionCountStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.2,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    whiteSpace: 'nowrap',
  };

  const detailViewHeaderRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
  };

  const detailViewControlRailStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'stretch',
    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.14)'}`,
    background: isDarkMode ? 'rgba(6, 23, 51, 0.2)' : 'rgba(244, 244, 246, 0.45)',
  };

  const detailViewToggleBaseStyle: React.CSSProperties = {
    appearance: 'none',
    border: 'none',
    borderRadius: 0,
    margin: 0,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 9px',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.1,
    textTransform: 'uppercase',
    letterSpacing: '0.35px',
  };

  const detailViewSmallToggleStyle = (selected: boolean): React.CSSProperties => ({
    ...detailViewToggleBaseStyle,
    appearance: 'none',
    background: selected
      ? (isDarkMode ? 'rgba(135, 243, 243, 0.14)' : 'rgba(54, 144, 206, 0.12)')
      : 'transparent',
    color: selected
      ? (isDarkMode ? colours.accent : colours.highlight)
      : (isDarkMode ? colours.subtleGrey : colours.greyText),
    borderRight: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.14)'}`,
  });

  const detailViewLargeToggleStyle = (selected: boolean): React.CSSProperties => ({
    ...detailViewToggleBaseStyle,
    background: selected
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
      : 'transparent',
    color: selected
      ? (isDarkMode ? colours.dark.text : colours.light.text)
      : (isDarkMode ? '#c4c9d4' : '#374151'),
    borderRight: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.14)'}`,
  });

  const detailViewEndToggleStyle = (selected: boolean): React.CSSProperties => ({
    ...detailViewToggleBaseStyle,
    background: selected
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
      : 'transparent',
    color: selected
      ? (isDarkMode ? colours.dark.text : colours.light.text)
      : (isDarkMode ? '#c4c9d4' : '#374151'),
  });

  const getAlternatingLineStyle = (index: number): React.CSSProperties => ({
    background: index % 2 === 0
      ? 'transparent'
      : (isDarkMode ? 'rgba(54, 144, 206, 0.035)' : 'rgba(54, 144, 206, 0.045)'),
    padding: '4px 6px',
  });

  const detailViewAllColumnsStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: 12,
    alignItems: 'start',
  };

  const systemLogoMaskStyle = (logoUrl: string): React.CSSProperties => ({
    display: 'inline-block',
    width: 18,
    height: 18,
    flexShrink: 0,
    backgroundColor: 'currentColor',
    transition: 'background-color 160ms ease, color 160ms ease',
    WebkitMaskImage: `url(${logoUrl})`,
    maskImage: `url(${logoUrl})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  });

  return (
    <div className={`${containerStyle(isDarkMode)} ${entryStyle}`}>
      {/* Header — breadcrumb path */}
      <div className={headerStyle(isDarkMode, showNextSteps)}>
        <div className={headerLeftStyle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', fontFamily: 'Raleway, sans-serif', fontSize: 12, lineHeight: '18px' }}>
            {/* Back button — visible when CCL workbench is open */}
            {showCCLEditor && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCCLEditor(false)}
                  aria-label="Back to matter"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, flexShrink: 0,
                    background: 'transparent', border: 'none', borderRadius: 2,
                    cursor: 'pointer',
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    transition: 'color 0.12s ease, background 0.12s ease',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = isDarkMode ? colours.accent : colours.highlight;
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isDarkMode ? colours.subtleGrey : colours.greyText;
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icon iconName="ChromeBack" styles={{ root: { fontSize: 11 } }} />
                </button>
                <span style={{ color: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', fontSize: 10 }}>|</span>
              </>
            )}
            {/* Segment 1: Client name */}
            {headerClientName ? (
              <span style={{ fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(headerClientName)}</span>
            ) : (
              <span style={{ fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>—</span>
            )}

            <span style={{ color: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', fontSize: 10 }}>/</span>

            {/* Segment 2: Matter — ref or workbench label */}
            {showCCLEditor ? (
              <span style={{ fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>CCL Workbench</span>
            ) : clioUrl ? (
              <Link
                href={clioUrl}
                target="_blank"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontSize: 12,
                    ':hover': { textDecoration: 'underline', color: isDarkMode ? colours.accent : colours.highlight },
                  },
                }}
              >
                {fmt(headerDisplayNumber)}{matter.matterName || matter.description ? ` · ${fmt(matter.matterName || matter.description)}` : ''}
              </Link>
            ) : (
              <span style={{ fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmt(headerDisplayNumber)}{matter.matterName || matter.description ? ` · ${fmt(matter.matterName || matter.description)}` : ''}
              </span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={statusBadgeStyle(matter.status, isDarkMode)}>
            <Icon
              iconName={matter.status === 'active' ? 'StatusCircleCheckmark' : 'StatusCircleBlock'}
              styles={{ root: { fontSize: 12 } }}
            />
            {matter.status === 'active' ? 'Active' : 'Closed'}
          </div>
        </div>
      </div>

      {/* Tab Navigation moved into the sticky navigator banner (Matters.tsx). */}

      {/* CCL Editor — replaces main content when open (CCL users only) */}
      {canSeeCcl && showCCLEditor && (
        <div style={{ padding: '0', flex: 1, display: 'flex', flexDirection: 'column' as const, minHeight: 0, width: 'min(1160px, 100%)', alignSelf: 'center' }}>
        <CCLEditor
          matter={matter}
          teamData={teamData}
          demoModeEnabled={demoModeEnabled}
          userInitials={userInitials}
          instructionPaymentReceived={instructionPaymentReceived}
          onClose={() => setShowCCLEditor(false)}
        />
        </div>
      )}

      {/* Main Content — hidden when CCL editor is open */}
      {!showCCLEditor && (
      <>
      {(!activeTab || activeTab === 'overview') && (
      <>
      <div className={mainLayoutStyle}>
        {/* Left side — banners + content stack beneath header */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, minHeight: 0 }}>
      {/* ─── Pipeline Zone: Next Steps prompts + collapsible workbench ─── */}
      {isPipelineLinked && (
        <div style={{
          background: isDarkMode ? colours.darkBlue : colours.grey,
          fontFamily: 'Raleway, sans-serif',
        }}>
          {/* Next Steps — inline dot prompts */}
          {showNextSteps && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '9px 24px',
              background: isDarkMode ? colours.websiteBlue : '#ffffff',
              borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(6, 23, 51, 0.04)'}`,
              borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.45)' : 'rgba(6, 23, 51, 0.08)'}`,
              boxShadow: isDarkMode ? 'inset 0 -1px 0 rgba(0, 0, 0, 0.2)' : 'inset 0 -1px 0 rgba(6, 23, 51, 0.02)',
              flexWrap: 'wrap' as const,
            }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                color: isDarkMode ? colours.accent : colours.highlight,
                marginRight: 6,
              }}>
                Next
              </span>
              {matter.status === 'active' && cclStage === 'pending' && (
                <NextStepChip title="CCL service pending" icon="TextDocument" isDarkMode={isDarkMode} category="standard" />
              )}
              {matter.status === 'active' && cclIsGenerated && (
                <NextStepChip title="CCL generated" subtitle={cclServiceSummary.confidence || ''} icon="CompletedSolid" isDarkMode={isDarkMode} category="success" />
              )}
              {matter.status === 'active' && cclIsReviewed && (
                <NextStepChip title="CCL reviewed" icon="CompletedSolid" isDarkMode={isDarkMode} category="success" />
              )}
              {cclIsSent && (
                <NextStepChip title="CCL sent" subtitle={fmtDate(matter.cclDate)} icon="CompletedSolid" isDarkMode={isDarkMode} category="success" />
              )}
              {outstandingBalance > 0 && !isOutstandingLoading && (
                <NextStepChip title="Outstanding balance" subtitle={fmtCurrency(outstandingBalance)} icon="Money" isDarkMode={isDarkMode} category="warning" />
              )}
              {matter.status === 'closed' && (
                <NextStepChip title="Closed" subtitle={matter.closeDate ? fmtDate(matter.closeDate) : ''} icon="StatusCircleBlock" isDarkMode={isDarkMode} category="warning" />
              )}
            </div>
          )}

          {/* Pill rail + expand toggle */}
          {derivedWorkbenchItem ? (
            <>
              <PipelineSection
                derivedWorkbenchItem={derivedWorkbenchItem}
                isDarkMode={isDarkMode}
                teamData={teamData}
                demoModeEnabled={demoModeEnabled}
                matchedEnquiry={matchedEnquiry}
                selectedWorkbenchTab={selectedWorkbenchTab}
                setSelectedWorkbenchTab={setSelectedWorkbenchTab}
                selectedContextStage={selectedContextStage}
                setSelectedContextStage={setSelectedContextStage}
                selectedMatterStage={selectedMatterStage}
                setSelectedMatterStage={setSelectedMatterStage}
                onSelectCclStage={() => setShowCCLEditor(true)}
                canSeeCcl={canSeeCcl}
                collapsed={!workbenchExpanded}
                expanded={workbenchExpanded}
                onToggleCollapsed={() => setWorkbenchExpanded((prev) => !prev)}
              />
            </>
          ) : (
            <div style={{
              padding: '10px 24px',
              fontSize: 12,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
            }}>
              Pipeline details will appear once an Instruction is linked.
            </div>
          )}
        </div>
      )}
      <div style={{
        backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
        borderBottom: `1px solid ${isDarkMode ? `${colours.dark.borderColor}55` : 'rgba(6, 23, 51, 0.08)'}`,
        boxShadow: isDarkMode ? 'inset 0 1px 0 rgba(255, 255, 255, 0.02)' : 'none',
      }}>
        {/* KPI Banner — full-width metrics strip */}
        <div className={kpiBannerStyle(isDarkMode)}>
          <div className={kpiBannerItemStyle(isDarkMode, true)}>
            <div className="kpi-label" style={kpiLabelRowStyle}>WIP</div>
            <div className="kpi-value" style={{ ...kpiValueRowStyle, color: colours.highlight }}>{isWipLoading ? '…' : fmtCurrency(billableAmount)}</div>
            <div className="kpi-sub" style={kpiSubRowStyle}>{isWipLoading ? '' : `${billableHours.toFixed(1)}h billable`}</div>
          </div>
          <div className={kpiBannerItemStyle(isDarkMode)}>
            <div className="kpi-label" style={kpiLabelRowStyle}>Outstanding</div>
            <div className="kpi-value" style={{ ...kpiValueRowStyle, ...(outstandingBalance > 0 ? { color: colours.cta } : null) }}>
              {isOutstandingLoading ? '…' : fmtCurrency(outstandingBalance)}
            </div>
            <div className="kpi-sub" style={kpiSubRowStyle}>Balance due</div>
          </div>
          <div className={kpiBannerItemStyle(isDarkMode)}>
            <div className="kpi-label" style={kpiLabelRowStyle}>Funds</div>
            <div className="kpi-value" style={{ ...kpiValueRowStyle, ...(clientFunds > 0 ? { color: colours.highlight } : null) }}>
              {isFundsLoading ? '…' : fmtCurrency(clientFunds)}
            </div>
            <div className="kpi-sub" style={kpiSubRowStyle}>On account</div>
          </div>
          <div className={kpiBannerItemStyle(isDarkMode)}>
            <div className="kpi-label" style={kpiLabelRowStyle}>Hours</div>
            <div className="kpi-value" style={kpiValueRowStyle}>{isWipLoading ? '…' : `${totalHours.toFixed(1)}h`}</div>
            <div className="kpi-sub" style={kpiSubRowStyle}>{isWipLoading ? '' : `${billablePct}% billable`}</div>
          </div>
        </div>

        {/* Billable ratio bar — visually part of the KPI block */}
        <div style={{
          padding: '14px 24px 10px',
          backgroundColor: 'transparent',
        }}>
          {isWipLoading ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                <span className={metricSubSkeletonStyle(isDarkMode, '72px')} style={{ height: 10 }} />
                <span className={metricSubSkeletonStyle(isDarkMode, '86px')} style={{ height: 10 }} />
              </div>
              <div className={progressBarStyle(isDarkMode)} style={{ height: 3, opacity: 0.4 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 3 }}>
                <span className={metricSubSkeletonStyle(isDarkMode, '48px')} style={{ height: 8 }} />
                <span className={metricSubSkeletonStyle(isDarkMode, '64px')} style={{ height: 8 }} />
              </div>
            </>
          ) : totalHours > 0 ? (
            <>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 16,
                marginBottom: 4,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.1,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  }}>
                    {billableHours.toFixed(1)}h
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.3px',
                    lineHeight: 1.1,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  }}>
                    Billable
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.1,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  }}>
                    {nonBillableHours.toFixed(1)}h
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.3px',
                    lineHeight: 1.1,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  }}>
                    Non-billable
                  </span>
                </div>
              </div>
              <div className={progressBarStyle(isDarkMode)} style={{ height: 3 }}>
                <div className={progressFillStyle(billablePct)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 3, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                <span>{billablePct}%</span>
                <span>{100 - billablePct}%</span>
              </div>
            </>
          ) : (
            <>
              <div className={progressBarStyle(isDarkMode)} style={{ height: 3, opacity: 0.25 }} />
              <div style={{ fontSize: 10, marginTop: 3, color: isDarkMode ? colours.subtleGrey : colours.greyText, textAlign: 'center' }}>
                No time recorded
              </div>
            </>
          )}
        </div>
      </div>

        <div className={leftColumnStyle(isDarkMode)}>
          {/* Unified Matter Details + Clio/ND + Team */}
          <div ref={cclSectionRef} className={sectionCardStyle(isDarkMode)}>
            {/* Matter Details — compact strip */}
            <div className={sectionTitleStyle(isDarkMode)}>
              <FaFolderOpen size={12} style={{ color: colours.highlight }} />
              Matter Details
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
              {matterRecordFields.map((field, index) => (
                <div key={`banner-matter-${field.label}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 0' }}>
                  <span style={{ ...detailKickerTextStyle, fontSize: 9, whiteSpace: 'nowrap' }}>{field.label}</span>
                  <span style={{ ...detailValueTextStyle, fontSize: 12 }}>{field.value}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)'}`, margin: '4px 0' }} />

            {/* Clio + NetDocuments — side-by-side panels */}
            <div className={detailPanelsGridStyle}>
              <div className={`${backendSystemPanelStyle(isDarkMode)} ${detailsMotionItemStyle(80)}`}>
                <div className={backendSystemHeaderStyle(isDarkMode)}>
                  {clioUrl ? (
                    <Link
                      href={clioUrl}
                      target="_blank"
                      styles={{
                        root: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          minWidth: 0,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          textDecoration: 'none',
                          padding: '0',
                          margin: 0,
                          transition: 'color 160ms ease, transform 180ms ease, text-shadow 180ms ease',
                          ':hover': {
                            color: isDarkMode ? colours.accent : colours.highlight,
                            transform: 'translateY(-1px)',
                            textShadow: isDarkMode ? '0 1px 10px rgba(135, 243, 243, 0.20)' : '0 1px 8px rgba(54, 144, 206, 0.16)',
                            textDecoration: 'none',
                          },
                          ':active': {
                            transform: 'translateY(0)',
                          },
                        },
                      }}
                    >
                      <span style={systemLogoMaskStyle(clioLogo)} />
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        gap: 4,
                        minWidth: 0,
                        width: '100%',
                      }}>
                        <div style={{
                          display: 'block',
                          position: 'static',
                          margin: 0,
                          width: '100%',
                          minWidth: 0,
                          fontFamily: 'Raleway, sans-serif',
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.35,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}>Clio Matter</div>
                      </div>
                    </Link>
                  ) : (
                    <div className={backendSystemBrandStyle}>
                      <span style={systemLogoMaskStyle(clioLogo)} />
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        gap: 4,
                        minWidth: 0,
                        width: '100%',
                      }}>
                        <div style={{
                          display: 'block',
                          position: 'static',
                          margin: 0,
                          width: '100%',
                          minWidth: 0,
                          fontFamily: 'Raleway, sans-serif',
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.35,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}>Clio Matter</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={detailsSectionsStackStyle}>
                  <div className={`${detailSectionStyle(isDarkMode)} ${detailsMotionItemStyle(205)}`}>
                    <div className={detailSectionHeaderStyle(isDarkMode)}>
                      <button type="button" onClick={() => toggleDetailSection('activities')} style={sectionToggleButtonStyle}>
                        <span style={sectionToggleLeftStyle}>
                          {expandedDetailSections.activities ? (
                            <FaChevronDown size={10} color={isDarkMode ? colours.subtleGrey : colours.greyText} />
                          ) : (
                            <FaChevronRight size={10} color={isDarkMode ? colours.subtleGrey : colours.greyText} />
                          )}
                          <span style={detailSectionTitleTextStyle}>Latest Activities</span>
                        </span>
                        <span style={sectionCountStyle}>{clioActivities.length}</span>
                      </button>
                    </div>
                    {expandedDetailSections.activities && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {clioActivitiesStatus === 'loading' && (
                          <div style={detailMetaTextStyle}>Loading latest Clio activities…</div>
                        )}
                        {clioActivitiesStatus === 'error' && (
                          <div style={detailMetaTextStyle}>Clio activities unavailable.</div>
                        )}
                        {clioActivitiesStatus === 'ready' && clioActivities.length === 0 && (
                          <div style={detailMetaTextStyle}>No Clio activities recorded yet.</div>
                        )}
                        {clioActivitiesStatus === 'ready' && visibleClioActivities.length > 0 && (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                              {visibleClioActivities.map((activity, index) => {
                                const activityName = formatDetailText(activity.activity_description?.name || activity.expense_category?.name || activity.type, 'Activity');
                                const activityDate = formatDetailDate(activity.date || activity.created_at, 'Not dated');
                                const activityHoursRaw = Number(activity.rounded_quantity_in_hours ?? activity.quantity_in_hours);
                                const activityHours = Number.isFinite(activityHoursRaw) && activityHoursRaw > 0
                                  ? `${activityHoursRaw.toFixed(1)}h`
                                  : '';
                                const activityTotalRaw = Number(activity.total);
                                const activityTotal = Number.isFinite(activityTotalRaw)
                                  ? fmtCurrency(activityTotalRaw)
                                  : '';
                                const activityNote = String(activity.note || '').trim();
                                const statusBits = [
                                  activity.non_billable ? 'Non-billable' : '',
                                  activity.billed ? 'Billed' : 'Unbilled',
                                  activityTotal,
                                ].filter(Boolean);

                                return (
                                  <div
                                    key={`clio-activity-${activity.id || index}`}
                                    className={detailFieldCardStyle(isDarkMode)}
                                    style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 8, paddingRight: 10 }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                                      <div style={{ minWidth: 62, maxWidth: 62, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 1 }}>
                                        <div style={{ ...detailValueTextStyle, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{activityDate}</div>
                                        {activityHours && (
                                          <div style={{ ...detailMetaTextStyle, fontSize: 10 }}>{activityHours}</div>
                                        )}
                                      </div>
                                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <div style={{ ...detailValueTextStyle, fontSize: 11 }}>{activityName}</div>
                                        {activityNote && (
                                          <div style={{ ...detailMetaTextStyle, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityNote}</div>
                                        )}
                                      </div>
                                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {statusBits.length > 0 && (
                                          <div style={{ ...detailMetaTextStyle, fontSize: 10, whiteSpace: 'nowrap' }}>{statusBits.join(' · ')}</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                              <div style={detailMetaTextStyle}>
                                Showing {visibleClioActivities.length} of {clioActivities.length} · Page {clioActivitiesCurrentPage} of {clioActivitiesPageCount}
                              </div>
                              {visibleClioActivities.length < clioActivities.length && (
                                <button
                                  type="button"
                                  onClick={() => setClioActivitiesVisibleCount((current) => current + 5)}
                                  style={{
                                    appearance: 'none',
                                    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.12)'}`,
                                    background: 'transparent',
                                    color: isDarkMode ? colours.dark.text : colours.light.text,
                                    padding: '5px 10px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Load more
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {clioCustomFields.length > 0 && (
                    <div className={`${detailSectionStyle(isDarkMode)} ${detailsMotionItemStyle(260)}`}>
                      <div className={detailSectionHeaderStyle(isDarkMode)}>
                        <button type="button" onClick={() => toggleDetailSection('custom')} style={sectionToggleButtonStyle}>
                          <span style={sectionToggleLeftStyle}>
                            {expandedDetailSections.custom ? (
                              <FaChevronDown size={10} color={isDarkMode ? colours.subtleGrey : colours.greyText} />
                            ) : (
                              <FaChevronRight size={10} color={isDarkMode ? colours.subtleGrey : colours.greyText} />
                            )}
                            <span style={detailSectionTitleTextStyle}>Clio Custom Fields</span>
                          </span>
                          <span style={sectionCountStyle}>{clioCustomFields.length}</span>
                        </button>
                      </div>
                      {expandedDetailSections.custom && (
                        <div className={detailFieldGridStyle}>
                          {clioCustomFields.map((field, index) => (
                            <div key={field.key} className={detailFieldCardStyle(isDarkMode)}>
                              <div className={detailFieldStackStyle}>
                                <div style={detailKickerTextStyle}>{field.label}</div>
                                <div style={detailValueTextStyle}>{field.value}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

              <div className={`${backendSystemPanelStyle(isDarkMode)} ${detailsMotionItemStyle(120)}`}>
                <div className={backendSystemHeaderStyle(isDarkMode)}>
                  {netDocumentsWorkspace?.url ? (
                    <Link
                      href={netDocumentsWorkspace.url}
                      target="_blank"
                      styles={{
                        root: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          minWidth: 0,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          textDecoration: 'none',
                          padding: '0',
                          margin: 0,
                          transition: 'color 160ms ease, transform 180ms ease, text-shadow 180ms ease',
                          ':hover': {
                            color: isDarkMode ? colours.accent : colours.highlight,
                            transform: 'translateY(-1px)',
                            textShadow: isDarkMode ? '0 1px 10px rgba(135, 243, 243, 0.20)' : '0 1px 8px rgba(54, 144, 206, 0.16)',
                            textDecoration: 'none',
                          },
                          ':active': {
                            transform: 'translateY(0)',
                          },
                        },
                      }}
                    >
                      <span style={systemLogoMaskStyle(netdocumentsLogo)} />
                      <div style={{ display: 'grid', rowGap: 4, minWidth: 0, alignContent: 'start' }}>
                        <div className={backendSystemTitleStyle(isDarkMode)} style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.3, color: 'inherit' }}>NetDocuments Workspace</div>
                      </div>
                    </Link>
                  ) : (
                    <div className={backendSystemBrandStyle}>
                      <span style={systemLogoMaskStyle(netdocumentsLogo)} />
                      <div style={{ display: 'grid', rowGap: 4, minWidth: 0, alignContent: 'start' }}>
                        <div className={backendSystemTitleStyle(isDarkMode)} style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.3 }}>NetDocuments Workspace</div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={getDetailChipStyle(colours.accent, isDarkMode)}>Live Link</span>
                  </div>
                </div>

                {netDocumentsClientId && netDocumentsMatterKey ? (
                  <>
                    {netDocumentsBreadcrumbs.length > 1 && (
                      <div className={backendTreePathStyle(isDarkMode)}>
                        <FaFolderOpen size={12} color={isDarkMode ? colours.accent : colours.highlight} />
                        {netDocumentsBreadcrumbs.map((crumb, index) => (
                          <React.Fragment key={`${crumb.id}-${index}`}>
                            {index > 0 && <span>/</span>}
                            <button
                              type="button"
                              onClick={() => handleNetDocumentsBreadcrumbClick(index)}
                              style={{
                                appearance: 'none',
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                cursor: 'pointer',
                                color: isDarkMode ? colours.dark.text : colours.light.text,
                                fontSize: 11,
                                fontWeight: index === netDocumentsBreadcrumbs.length - 1 ? 600 : 500,
                              }}
                            >
                              {crumb.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {netDocumentsWorkspaceLoading ? (
                      <div className={backendTreeMetaStyle(isDarkMode)}>Loading NetDocuments workspace…</div>
                    ) : netDocumentsWorkspaceError ? (
                      <div className={backendTreeMetaStyle(isDarkMode)} style={{ color: colours.cta }}>
                        {netDocumentsWorkspaceError}
                      </div>
                    ) : sortedNetDocumentsItems.length === 0 ? (
                      <div className={backendTreeMetaStyle(isDarkMode)}>Workspace resolved but no items were returned for this level.</div>
                    ) : (
                      <div className={backendTreeListStyle}>
                        {sortedNetDocumentsItems.map((item, index) => {
                          const isFolder = item.type === 'container';
                          const itemTone = isFolder ? colours.highlight : colours.subtleGrey;
                          const itemBadge = isFolder ? 'Folder' : (item.extension || 'Document').toUpperCase();
                          const itemMeta = [
                            item.modified ? `Modified ${formatDetailDate(item.modified, 'Unknown')}` : '',
                            item.modifiedBy ? `by ${item.modifiedBy}` : '',
                          ].filter(Boolean).join(' ');

                          return (
                            <div key={`${item.id || item.name || 'nd-item'}-${index}`} className={`${backendTreeItemStyle(isDarkMode, 0)} ${detailsMotionItemStyle(150 + (index * 25))}`} style={getAlternatingLineStyle(index)}>
                              <div className={backendTreeMainStyle}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, marginTop: 1, flexShrink: 0 }}>
                                  {isFolder
                                    ? <FaFolderOpen size={12} color={colours.highlight} />
                                    : <FaFileAlt size={11} color={isDarkMode ? colours.subtleGrey : colours.greyText} />}
                                </span>
                                <div className={backendTreeTextStyle} style={{ display: 'grid', rowGap: 4, minWidth: 0, alignContent: 'start' }}>
                                  {isFolder ? (
                                    <button
                                      type="button"
                                      onClick={() => handleNetDocumentsOpenFolder(item)}
                                      style={{
                                        appearance: 'none',
                                        display: 'block',
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        margin: 0,
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <div className={backendTreeTitleStyle(isDarkMode)} style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{item.name || 'Unnamed folder'}</div>
                                    </button>
                                  ) : item.url ? (
                                    <Link
                                      href={item.url}
                                      target="_blank"
                                      styles={{
                                        root: {
                                          display: 'block',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          lineHeight: 1.4,
                                          color: isDarkMode ? colours.dark.text : colours.light.text,
                                          textDecoration: 'none',
                                          whiteSpace: 'normal',
                                          overflowWrap: 'anywhere',
                                        },
                                      }}
                                    >
                                      {item.name || 'Unnamed document'}
                                    </Link>
                                  ) : (
                                    <div className={backendTreeTitleStyle(isDarkMode)} style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{item.name || 'Unnamed document'}</div>
                                  )}
                                  <div className={backendTreeMetaStyle(isDarkMode)} style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.45 }}>
                                    {itemMeta || (isFolder ? 'Open folder contents' : 'Document item')}
                                  </div>
                                </div>
                              </div>
                              <span style={getDetailChipStyle(itemTone, isDarkMode)}>{itemBadge}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className={backendTreeMetaStyle(isDarkMode)}>
                    NetDocuments lookup needs both a client ID and a matter key on this record.
                  </div>
                )}
              </div>
          </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.08)'}`, margin: '4px 0' }} />

            {/* Team — bottom strip */}
            <div className={sectionTitleStyle(isDarkMode)} style={{ marginTop: 0 }}>
              <Icon iconName="People" styles={{ root: { color: colours.highlight } }} />
              Team
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
              {assignmentFields.map((field, index) => (
                <div key={`team-field-${field.label}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 0' }}>
                  <span style={{ ...detailKickerTextStyle, fontSize: 9, whiteSpace: 'nowrap' }}>{field.label}</span>
                  <span style={{ ...detailValueTextStyle, fontSize: 12 }}>{field.value}</span>
                </div>
              ))}
            </div>
          </div>

          {canSeeCcl && (
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="TextDocument" styles={{ root: { color: colours.highlight } }} />
              Client Care Letter
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      marginTop: 1,
                      background: cclIsSent ? colours.green : cclIsGenerated || cclIsReviewed ? colours.highlight : colours.subtleGrey,
                      boxShadow: `0 0 0 4px ${cclIsSent ? 'rgba(32, 178, 108, 0.14)' : cclIsGenerated || cclIsReviewed ? 'rgba(54, 144, 206, 0.14)' : 'rgba(160, 160, 160, 0.12)'}`,
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {cclIsSent ? `Sent ${fmtDate(matter.cclDate)}` : cclStatusLabel}
                    </span>
                    <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      {cclIsSent
                        ? 'Client care letter is recorded for this matter.'
                        : cclServiceSummary.needsAttention
                          ? (cclServiceSummary.attentionReason || 'Review required before the service can complete delivery.')
                          : cclIsReviewed
                            ? 'The service has completed review and is ready for delivery.'
                            : cclIsGenerated
                              ? 'The service has generated the draft and is waiting for review.'
                              : 'The CCL service will run automatically after matter opening.'}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCCLEditor(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: isDarkMode ? colours.darkBlue : '#ffffff',
                      border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                      borderRadius: 0,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon iconName="OpenInNewWindow" styles={{ root: { fontSize: 11, color: colours.highlight } }} />
                    {cclServiceSummary.needsAttention || hasCclDraft ? 'Open CCL Workbench' : 'View CCL Workbench'}
                  </button>
                )}
              </div>

              {hasCclDraft && (() => {
                const CCL_KEYS = [
                  'insert_current_position_and_scope_of_retainer', 'next_steps', 'realistic_timescale',
                  'handler_hourly_rate', 'charges_estimate_paragraph', 'disbursements_paragraph',
                  'costs_other_party_paragraph', 'figure', 'and_or_intervals_eg_every_three_months',
                  'may_will', 'insert_next_step_you_would_like_client_to_take', 'state_why_this_step_is_important',
                  'state_amount', 'insert_consequence', 'describe_first_document_or_information_you_need_from_your_client',
                  'describe_second_document_or_information_you_need_from_your_client',
                  'describe_third_document_or_information_you_need_from_your_client',
                  'identify_the_other_party_eg_your_opponents',
                ];
                const totalFields = CCL_KEYS.length;
                const filledFields = CCL_KEYS.filter(k => cclDraftFields[k]?.trim()).length;
                const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

                const highlights: { label: string; value: string }[] = [];
                const rate = cclDraftFields.handler_hourly_rate?.trim();
                if (rate) highlights.push({ label: 'Rate', value: `£${rate}/hr` });
                const estimate = cclDraftFields.charges_estimate_paragraph?.trim();
                if (estimate) highlights.push({ label: 'Estimate', value: estimate.length > 80 ? estimate.slice(0, 80) + '…' : estimate });
                const poa = cclDraftFields.figure?.trim();
                if (poa) highlights.push({ label: 'Payment on a/c', value: `£${poa}` });
                const timescale = cclDraftFields.realistic_timescale?.trim();
                if (timescale) highlights.push({ label: 'Timescale', value: timescale });
                const billing = cclDraftFields.and_or_intervals_eg_every_three_months?.trim();
                if (billing) highlights.push({ label: 'Billing', value: billing });
                const scope = cclDraftFields.insert_current_position_and_scope_of_retainer?.trim();

                return (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                      background: isDarkMode ? colours.darkBlue : colours.grey,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {/* Progress bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 999,
                        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: pct === 100 ? colours.green : colours.highlight,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: pct === 100
                          ? colours.green
                          : isDarkMode ? colours.dark.text : colours.light.text,
                        whiteSpace: 'nowrap',
                      }}>
                        {filledFields}/{totalFields}
                      </span>
                    </div>

                    {/* Key highlights */}
                    {highlights.length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px 12px',
                      }}>
                        {highlights.map(h => (
                          <span key={h.label} style={{ fontSize: 11, lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                              {h.label}
                            </span>
                            {' '}
                            <span style={{ color: isDarkMode ? '#d1d5db' : '#374151' }}>
                              {h.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Scope snippet */}
                    {scope && (
                      <div style={{
                        fontSize: 11,
                        lineHeight: 1.45,
                        color: isDarkMode ? '#d1d5db' : '#374151',
                        borderTop: `0.5px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        paddingTop: 8,
                      }}>
                        {scope.length > 180 ? scope.slice(0, 180) + '…' : scope}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          )}
        </div>
        </div>

        {/* Right Column - Client Sidebar (full-height panel) */}
        <div className={rightColumnStyle(isDarkMode)}>
          {/* Client Card */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Contact" styles={{ root: { color: colours.highlight } }} />
              Client
            </div>
            {isLegacyMatter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={fetchClioClient}
                  disabled={!matter.clientId || !userInitials || clioClientStatus === 'loading'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 0,
                    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                    background: isDarkMode ? colours.darkBlue : '#ffffff',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: (!matter.clientId || !userInitials || clioClientStatus === 'loading') ? 'not-allowed' : 'pointer',
                    opacity: (!matter.clientId || !userInitials) ? 0.5 : 1,
                  }}
                >
                  {clioClientStatus === 'loading'
                    ? 'Fetching from Clio…'
                    : clioClientStatus === 'ready'
                      ? 'Refresh from Clio'
                      : 'Fetch from Clio'}
                </button>
                {clioClientStatus === 'error' && (
                  <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    Clio client unavailable.
                  </span>
                )}
                {!matter.clientId && (
                  <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    Client ID missing for Clio hydration.
                  </span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isMatterRequest && !matter.instructionRef && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Matter request placeholder — client details will appear once an Instruction is linked.
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Link
                  href="#"
                  styles={{
                    root: {
                      fontWeight: 600,
                      color: colours.highlight,
                      fontSize: 13,
                    },
                  }}
                >
                  {pipelineTitle && !displayCompanyName
                    ? `${pipelineTitle} ${fmt(displayPrimaryName)}`
                    : fmt(displayPrimaryName)}
                </Link>
                {displayCompanyName && displayContactName && (
                  <span
                    style={{
                      fontSize: 12,
                      color: isDarkMode ? colours.dark.subText : colours.greyText,
                    }}
                  >
                    Contact: {displayContactLabel}
                  </span>
                )}
                {(displayClientEmail || displayClientPhone) && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                      fontSize: 12,
                      color: isDarkMode ? colours.dark.subText : colours.greyText,
                      lineHeight: '16px',
                    }}
                  >
                    {displayClientEmail && (
                      <div className={contactRowStyle}>
                        <a
                          href={`mailto:${displayClientEmail}`}
                          style={{
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            opacity: isDarkMode ? 0.78 : 0.8,
                            textDecoration: 'none',
                            fontWeight: 500,
                            minWidth: 0,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          {displayClientEmail}
                        </a>
                        <button
                          type="button"
                          className={copyChipStyle(copiedContact === 'email', isDarkMode)}
                          onClick={() => handleCopy(displayClientEmail, 'email')}
                          aria-label={copiedContact === 'email' ? 'Copied email' : 'Copy email'}
                          title={copiedContact === 'email' ? 'Copied' : 'Copy email'}
                        >
                          <Icon
                            iconName={copiedContact === 'email' ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: copiedContact === 'email' ? colours.highlight : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    )}
                    {displayClientPhone && (
                      <div className={contactRowStyle}>
                        <a
                          href={`tel:${displayClientPhone}`}
                          style={{
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            opacity: isDarkMode ? 0.78 : 0.8,
                            textDecoration: 'none',
                            fontWeight: 500,
                            minWidth: 0,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          {displayClientPhone}
                        </a>
                        <button
                          type="button"
                          className={copyChipStyle(copiedContact === 'phone', isDarkMode)}
                          onClick={() => handleCopy(displayClientPhone, 'phone')}
                          aria-label={copiedContact === 'phone' ? 'Copied phone' : 'Copy phone'}
                          title={copiedContact === 'phone' ? 'Copied' : 'Copy phone'}
                        >
                          <Icon
                            iconName={copiedContact === 'phone' ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: copiedContact === 'phone' ? colours.highlight : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isLegacyMatter ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    opacity: clioClientStatus === 'ready' ? 1 : 0.55,
                  }}
                >
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Type</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(clioType)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Date of birth</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(formatLongDate(clioDob || undefined))}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Address</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayPersonAddress)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={clientFieldStackStyle}>
                      <span className={fieldLabelStyle(isDarkMode)}>Gender</span>
                      <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineGender)}</span>
                    </div>
                    <div className={clientFieldStackStyle}>
                      <span className={fieldLabelStyle(isDarkMode)}>Nationality</span>
                      <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineNationality)}</span>
                    </div>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Date of birth</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>
                      {fmt(pipelineDob)}
                      {pipelineAge !== '—' && pipelineAge && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            color: isDarkMode ? colours.dark.subText : colours.greyText,
                          }}
                        >
                          Age {pipelineAge}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Address</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayPersonAddress)}</span>
                  </div>
                </div>
              )}

              {displayCompanyName && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  }}
                >
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayCompanyName)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company no.</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineCompanyNo)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company addr</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayCompanyAddress)}</span>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  paddingTop: 12,
                  borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                }}
              >
                {displayClientPhone && (
                  <TooltipHost content={`Call ${displayClientPhone}`}>
                    <a
                      href={`tel:${displayClientPhone}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Call Client"
                    >
                      <Icon
                        iconName="Phone"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
                {displayClientEmail && (
                  <TooltipHost content={`Email ${displayClientEmail}`}>
                    <a
                      href={`mailto:${displayClientEmail}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Email Client"
                    >
                      <Icon
                        iconName="Mail"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
              </div>

              {/* Contact is shown inline under the client name; quick actions remain above. */}
            </div>
          </div>

          {/* Reference — compact key dates, CCL, and identifiers */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Opened</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{fmtDate(matter.openDate)}</span>
              </div>
              {matter.closeDate && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Closed</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{fmtDate(matter.closeDate)}</span>
                </div>
              )}
              {matter.instructionRef && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Instruction</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{fmt(matter.instructionRef)}</span>
                </div>
              )}
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Matter ID</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(matter.matterId)}</span>
              </div>
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Client ID</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(matter.clientId)}</span>
              </div>
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Clio Contact</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(clioClient?.id || matter.clientId)}</span>
              </div>
              {enquiryAcid && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>ACID</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(enquiryAcid)}</span>
                </div>
              )}
              {enquiryInternalId && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Enquiry ID</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(enquiryInternalId)}</span>
                </div>
              )}
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Passcode</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{formatDetailText(pipelineLink.passcode)}</span>
              </div>
              {portalUrl && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '80px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Portal</span>
                  <button
                    type="button"
                    onClick={() => setIsPortalLaunchOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      fontSize: 12,
                      fontWeight: 500,
                      color: colours.highlight,
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Open client destination
                    <Icon iconName="OpenInNewWindow" styles={{ root: { fontSize: 10 } }} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {auditAllowed && (
            <div className={sectionCardStyle(isDarkMode)}>
              <div className={sectionTitleStyle(isDarkMode)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon iconName="Sync" styles={{ root: { color: colours.highlight } }} />
                  Sync audit
                </div>
                <button
                  type="button"
                  onClick={onToggleAudit}
                  style={{
                    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                    background: auditEnabled ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)') : 'transparent',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    padding: '4px 10px',
                    borderRadius: 0,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {auditEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>
              {!auditEnabled && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Enable to compare key fields with Clio.
                </span>
              )}
              {auditEnabled && auditStatus === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className={metricSubSkeletonStyle(isDarkMode, '85%')} />
                  <div className={metricSubSkeletonStyle(isDarkMode, '70%')} />
                </div>
              )}
              {auditEnabled && auditStatus === 'error' && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Sync audit unavailable.
                </span>
              )}
              {auditEnabled && auditStatus === 'ready' && auditUnlinked && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Clio matter not linked yet.
                </span>
              )}
              {auditEnabled && auditStatus === 'ready' && !auditUnlinked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditFields.map((field: any) => {
                    const status = field?.status || 'match';
                    const colour =
                      status === 'mismatch'
                        ? colours.yellow
                        : status === 'missing'
                        ? (isDarkMode ? colours.dark.subText : colours.greyText)
                        : colours.highlight;
                    return (
                      <div
                        key={field?.key || field?.label}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: colour,
                            opacity: status === 'missing' ? 0.5 : 1,
                          }}
                        />
                        <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          {field?.label}
                        </span>
                      </div>
                    );
                  })}
                  {auditHasMismatch && (
                    <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                      Amber dots indicate mismatches.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data Source Badge */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              borderRadius: BADGE_RADIUS,
              fontSize: 11,
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              textAlign: 'center',
            }}
          >
            <TooltipHost
              content={isPipelineLinked
                ? 'New space (v2) — this matter is linked to the pipeline, so you can see origin, stages, and live workbench context. No action needed.'
                : 'Legacy space (v1) — this matter uses the classic view. Client details are pulled from Clio and will stay consistent here while we migrate.'}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 6px',
                  borderRadius: 999,
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  background: isDarkMode
                    ? colours.dark.cardBackground
                    : colours.light.sectionBackground,
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  cursor: 'default',
                  marginLeft: 6,
                }}
              >
                <Icon iconName="Info" styles={{ root: { fontSize: 10, opacity: 0.8 } }} />
                {isPipelineLinked ? 'v2 · Origin' : 'v1 · Clio'}
                {portalUrl && ' · Portal'}
              </span>
            </TooltipHost>
            {!isPipelineLinked && <span style={{ marginLeft: 6 }}>· Clio hydration planned</span>}
          </div>
        </div>
      </div>
      </>
      )}

      {/* ─── Activities Panel ─── */}
      {activeTab === 'activities' && (
        <div className={tabPanelContainerStyle(isDarkMode)}>
          <div className={tabPanelHeaderStyle(isDarkMode)}>
            <Icon iconName="Clock" styles={{ root: { color: colours.highlight, fontSize: 18 } }} />
            Activities
          </div>

          <div className={kpiStripStyle(isDarkMode)} style={{ borderBottom: 'none', paddingTop: 0 }}>
            <div className={kpiItemStyle(isDarkMode, true)}>
              <span className="kpi-label">Billable</span>
              <span className="kpi-value">{wipStatus === 'loading' ? '…' : fmtCurrency(billableAmount)}</span>
              <span className="kpi-sub">{wipStatus === 'loading' ? '' : `${billableHours.toFixed(1)}h`}</span>
            </div>
            <div className={kpiItemStyle(isDarkMode)}>
              <span className="kpi-label">Non-Billable</span>
              <span className="kpi-value">{wipStatus === 'loading' ? '…' : fmtCurrency(nonBillableAmount)}</span>
              <span className="kpi-sub">{wipStatus === 'loading' ? '' : `${nonBillableHours.toFixed(1)}h`}</span>
            </div>
            <div className={kpiItemStyle(isDarkMode)}>
              <span className="kpi-label">Total</span>
              <span className="kpi-value">{wipStatus === 'loading' ? '…' : `${totalHours.toFixed(1)}h`}</span>
              <span className="kpi-sub">{wipStatus === 'loading' ? '' : `${billablePct}% billable`}</span>
            </div>
          </div>

          <span className={tabEmptyStateStyle(isDarkMode)}>
            No activities loaded yet
          </span>
        </div>
      )}

      {/* ─── Documents Panel ─── */}
      {activeTab === 'documents' && (
        <div className={tabPanelContainerStyle(isDarkMode)}>
          <div className={tabPanelHeaderStyle(isDarkMode)}>
            <Icon iconName="TextDocument" styles={{ root: { color: colours.highlight, fontSize: 18 } }} />
            Documents
          </div>

          {/* CCL — inline status, not a hero card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <Icon
              iconName={hasCcl ? 'CompletedSolid' : 'Clock'}
              styles={{ root: { fontSize: 12, color: hasCcl ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText) } }}
            />
            <span style={{ color: isDarkMode ? '#d1d5db' : '#374151' }}>
              Client Care Letter: {hasCcl ? `Tracked ${fmtDate(matter.cclDate)}` : hasCclDraft ? 'Draft saved — ready for workbench review' : 'Not started yet'}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowCCLEditor(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  background: 'transparent',
                  border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.1)'}`,
                  borderRadius: 0,
                  color: colours.highlight,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Open workbench
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 8,
              paddingTop: 8,
              borderTop: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}55` : 'rgba(6, 23, 51, 0.08)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                  Latest saved draft
                </span>
                <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  {isCclDraftLoading
                    ? 'Checking draft status…'
                    : hasCclDraft
                    ? 'Draft detected — use the workbench for source trace and review actions'
                    : 'No saved draft yet'}
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showCclDraftPreview && hasCclDraft}
                aria-label="Toggle CCL draft preview"
                onClick={() => {
                  if (!hasCclDraft) return;
                  setShowCclDraftPreview((prev) => !prev);
                }}
                disabled={!hasCclDraft}
                style={{
                  width: 40,
                  height: 20,
                  borderRadius: 999,
                  border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}88` : 'rgba(6, 23, 51, 0.15)'}`,
                  background: showCclDraftPreview && hasCclDraft
                    ? colours.highlight
                    : (isDarkMode ? colours.dark.cardHover : colours.light.border),
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: showCclDraftPreview && hasCclDraft ? 'flex-end' : 'flex-start',
                  cursor: hasCclDraft ? 'pointer' : 'not-allowed',
                  opacity: hasCclDraft ? 1 : 0.6,
                  transition: 'all 0.2s ease',
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#ffffff',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                  }}
                />
              </button>
            </div>

            {showCclDraftPreview && hasCclDraft && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 0,
                  border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.1)'}`,
                  background: isDarkMode ? colours.dark.cardBackground : colours.grey,
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: isDarkMode ? '#d1d5db' : '#374151',
                }}
              >
                {cclDraftPreview
                  ? `${cclDraftPreview.slice(0, 220)}${cclDraftPreview.length > 220 ? '…' : ''}`
                  : 'Draft is saved. Open the workbench to inspect the full backend context and latest output.'}
              </div>
            )}
          </div>

          <span className={tabEmptyStateStyle(isDarkMode)}>
            No documents loaded yet
          </span>
        </div>
      )}

      {/* ─── Communications Panel ─── */}
      {activeTab === 'communications' && (
        <div className={tabPanelContainerStyle(isDarkMode)}>
          <div className={tabPanelHeaderStyle(isDarkMode)}>
            <Icon iconName="Chat" styles={{ root: { color: colours.highlight, fontSize: 18 } }} />
            Communications
          </div>

          {(displayClientEmail || displayClientPhone) && (
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
              {displayClientEmail && (
                <a href={`mailto:${displayClientEmail}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: colours.highlight, textDecoration: 'none' }}>
                  <Icon iconName="Mail" styles={{ root: { fontSize: 12 } }} />
                  {displayClientEmail}
                </a>
              )}
              {displayClientPhone && (
                <a href={`tel:${displayClientPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: isDarkMode ? colours.dark.text : colours.light.text, textDecoration: 'none' }}>
                  <Icon iconName="Phone" styles={{ root: { fontSize: 12 } }} />
                  {displayClientPhone}
                </a>
              )}
            </div>
          )}

          <span className={tabEmptyStateStyle(isDarkMode)}>
            No communications loaded yet
          </span>
        </div>
      )}

      {/* ─── Billing Panel ─── */}
      {activeTab === 'billing' && (
        <div className={tabPanelContainerStyle(isDarkMode)}>
          <div className={tabPanelHeaderStyle(isDarkMode)}>
            <Icon iconName="Money" styles={{ root: { color: colours.highlight, fontSize: 18 } }} />
            Billing
          </div>

          <div className={kpiStripStyle(isDarkMode)} style={{ borderBottom: 'none', paddingTop: 0 }}>
            <div className={kpiItemStyle(isDarkMode, true)}>
              <span className="kpi-label">WIP</span>
              <span className="kpi-value">{wipStatus === 'loading' ? '…' : fmtCurrency(billableAmount)}</span>
              <span className="kpi-sub">Unbilled time</span>
            </div>
            <div className={kpiItemStyle(isDarkMode)}>
              <span className="kpi-label">Outstanding</span>
              <span className="kpi-value" style={outstandingBalance > 0 ? { color: colours.cta } : undefined}>
                {outstandingStatus === 'loading' ? '…' : fmtCurrency(outstandingBalance)}
              </span>
              <span className="kpi-sub">Balance due</span>
            </div>
            <div className={kpiItemStyle(isDarkMode)}>
              <span className="kpi-label">Funds</span>
              <span className="kpi-value" style={clientFunds > 0 ? { color: colours.highlight } : undefined}>
                {fundsStatus === 'loading' ? '…' : fmtCurrency(clientFunds)}
              </span>
              <span className="kpi-sub">On account</span>
            </div>
          </div>

          <span className={tabEmptyStateStyle(isDarkMode)}>
            No transaction history loaded yet
          </span>
        </div>
      )}

      </>
      )}

      <PortalLaunchModal
        isOpen={isPortalLaunchOpen}
        model={portalLaunchModel}
        onClose={() => setIsPortalLaunchOpen(false)}
      />
    </div>
  );
};

export default MatterOverview;
