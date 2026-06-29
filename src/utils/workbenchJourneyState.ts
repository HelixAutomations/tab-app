import type { WorkbenchItem, WorkbenchItemRecord } from './workbenchTypes';

export type ProspectJourneyStageKey = 'claimed' | 'pitch' | 'instruction' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents';

export type ProspectJourneyStatus = 'complete' | 'processing' | 'blocked' | 'review' | 'warning' | 'pending' | 'neutral';

export interface ProspectJourneyStageState {
  key: ProspectJourneyStageKey;
  status: ProspectJourneyStatus;
  done: boolean;
  inProgress: boolean;
  blocked: boolean;
  hasIssue: boolean;
  label: string;
  shortLabel: string;
  statusText: string;
  title: string;
  dateRaw?: unknown;
  details?: { label: string; value: string }[];
}

export interface ProspectJourneyState {
  stages: Record<ProspectJourneyStageKey, ProspectJourneyStageState>;
  orderedStages: ProspectJourneyStageState[];
  nextStageKey: ProspectJourneyStageKey | null;
  currentStageKey: ProspectJourneyStageKey | null;
  instructionRef: string;
  instructionStage: string;
  isInstructionShell: boolean;
  isInstructionSubmitted: boolean;
  hasPitchEvidence: boolean;
  hasIdentityInput: boolean;
  hasIdentityResult: boolean;
  canRunIdCheck: boolean;
  idBlockedReason: string | null;
}

export interface ProspectJourneyInput {
  workbenchItem?: WorkbenchItem | null;
  enquiry?: WorkbenchItemRecord | null;
  enrichmentData?: WorkbenchItemRecord | null;
  enrichmentPitchData?: WorkbenchItemRecord | null;
  enrichmentTeamsData?: WorkbenchItemRecord | null;
}

const SHELL_INSTRUCTION_STAGES = new Set([
  '',
  'initialised',
  'initialized',
  'opened',
  'pitched',
  'checkout_link',
  'checkout link',
]);

const SUCCESS_PAYMENT_STATUSES = new Set(['succeeded', 'success', 'complete', 'completed', 'paid', 'confirmed']);
const PROCESSING_PAYMENT_STATUSES = new Set(['processing', 'requires_action', 'pending']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'cancelled', 'canceled']);
const COMPLETE_ID_RESULTS = new Set(['passed', 'pass', 'approved', 'verified']);

const toText = (value: unknown): string => String(value ?? '').trim();
const lower = (value: unknown): string => toText(value).toLowerCase();

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = toText(value);
    if (text && text !== '-' && text !== '—' && !/^(null|undefined|n\/a|na)$/i.test(text)) return text;
  }
  return '';
};

const firstValue = (...values: unknown[]): unknown => {
  for (const value of values) {
    const text = toText(value);
    if (text && text !== '-' && text !== '—' && !/^(null|undefined|n\/a|na)$/i.test(text)) return value;
  }
  return null;
};

const normalizeStatus = (value: unknown): string => lower(value).replace(/[\s-]+/g, '_');

export const isInstructionShellStage = (value: unknown): boolean => {
  const stage = normalizeStatus(value);
  if (SHELL_INSTRUCTION_STAGES.has(stage)) return true;
  return stage.includes('initiali') || stage === 'link_opened' || stage === 'checkout_opened';
};

const hasAnyValue = (record: WorkbenchItemRecord | null | undefined, keys: string[]): boolean => {
  if (!record) return false;
  return keys.some((key) => Boolean(firstText(record[key])));
};

const getInstructionRef = (instruction?: WorkbenchItemRecord | null, deal?: WorkbenchItemRecord | null): string => firstText(
  instruction?.InstructionRef,
  instruction?.instructionRef,
  instruction?.instruction_ref,
  deal?.InstructionRef,
  deal?.instructionRef,
  deal?.instruction_ref,
);

const getInstructionStage = (instruction?: WorkbenchItemRecord | null, deal?: WorkbenchItemRecord | null): string => firstText(
  instruction?.Stage,
  instruction?.stage,
  instruction?.InstructionStage,
  instruction?.instructionStage,
  deal?.Stage,
  deal?.stage,
  deal?.InstructionStage,
  deal?.instructionStage,
);

const getInstructionSubmittedRaw = (instruction?: WorkbenchItemRecord | null, deal?: WorkbenchItemRecord | null): unknown => firstValue(
  instruction?.SubmissionDate,
  instruction?.submissionDate,
  instruction?.SubmissionDateTime,
  instruction?.submissionDateTime,
  instruction?.InstructionDateTime,
  instruction?.instructionDateTime,
  instruction?.SubmittedAt,
  instruction?.submittedAt,
  instruction?.InstructionDate,
  instruction?.instructionDate,
  deal?.CloseDate,
  deal?.closeDate,
  deal?.close_date,
);

const hasIdentityInputFields = (instruction?: WorkbenchItemRecord | null): boolean => hasAnyValue(instruction, [
  'DOB',
  'DateOfBirth',
  'dateOfBirth',
  'PassportNumber',
  'passportNumber',
  'DriversLicenseNumber',
  'driversLicenseNumber',
  'DrivingLicenseNumber',
  'HouseNumber',
  'houseNumber',
  'Street',
  'street',
  'Postcode',
  'postcode',
]);

const hasPitchRecordContent = (record?: WorkbenchItemRecord | null): boolean => Boolean(record && (
  firstText(record.EmailSubject, record.emailSubject, record.EmailBody, record.emailBody, record.EmailBodyHtml, record.emailBodyHtml) ||
  firstText(record.PitchedDate, record.pitchedDate, record.CreatedAt, record.createdAt) ||
  firstText(record.DealId, record.dealId, record.InstructionRef, record.instructionRef, record.Passcode, record.passcode)
));

const getPitchEvidence = (workbenchItem: WorkbenchItem, enrichmentPitchData?: WorkbenchItemRecord | null): { hasPitch: boolean; dateRaw: unknown; details: { label: string; value: string }[] } => {
  const deal = workbenchItem?.deal ?? null;
  const pitch = workbenchItem?.pitch || workbenchItem?.Pitch || workbenchItem?.pitchRecord || workbenchItem?.pitchData || null;
  const effectivePitch = enrichmentPitchData || pitch;
  const hasPitch = Boolean(deal || hasPitchRecordContent(effectivePitch));
  const dateRaw = firstValue(
    enrichmentPitchData?.PitchedDate,
    enrichmentPitchData?.pitchedDate,
    enrichmentPitchData?.CreatedAt,
    enrichmentPitchData?.createdAt,
    deal?.PitchedDate,
    deal?.pitchedDate,
    effectivePitch?.PitchedDate,
    effectivePitch?.pitchedDate,
    effectivePitch?.CreatedAt,
    effectivePitch?.createdAt,
  );
  const details = [
    { label: 'Ref', value: getInstructionRef(workbenchItem?.instruction, deal) },
    { label: 'By', value: firstText(enrichmentPitchData?.PitchedBy, enrichmentPitchData?.pitchedBy, deal?.PitchedBy, deal?.pitchedBy, effectivePitch?.CreatedBy, effectivePitch?.createdBy) },
    { label: 'Status', value: firstText(deal?.Status, deal?.status, effectivePitch?.Status, effectivePitch?.status) },
  ].filter((detail) => detail.value);
  return { hasPitch, dateRaw, details };
};

const getClaimEvidence = (enquiry?: WorkbenchItemRecord | null, teamsData?: WorkbenchItemRecord | null): { hasClaim: boolean; dateRaw: unknown; label: string } => {
  const poc = firstText(enquiry?.Point_of_Contact, enquiry?.poc, teamsData?.ClaimedBy, teamsData?.claimedBy);
  const isTeamPoc = /^(team|team@helix-law\.com|team inbox)$/i.test(poc);
  const dateRaw = firstValue(
    teamsData?.ClaimedAt,
    teamsData?.claimedAt,
    enquiry?.ClaimedAt,
    enquiry?.claimed_at,
    enquiry?.ClaimTimestamp,
    enquiry?.claim_timestamp,
    teamsData?.MessageTimestamp,
    teamsData?.CreatedAt,
  );
  return {
    hasClaim: Boolean((poc && !isTeamPoc) || teamsData),
    dateRaw,
    label: poc && !isTeamPoc ? `Claimed by ${poc}` : 'Claimed',
  };
};

const evaluateIdentity = (instruction: WorkbenchItemRecord | null, eid: WorkbenchItemRecord | null, eids: WorkbenchItemRecord[], isInstructionSubmitted: boolean, isInstructionShell: boolean) => {
  const firstEid = eid || eids[0] || null;
  const result = lower(firstEid?.EIDOverallResult || firstEid?.eidOverallResult || instruction?.EIDOverallResult || instruction?.eidOverallResult);
  const status = lower(firstEid?.EIDStatus || firstEid?.eidStatus || instruction?.EIDStatus || instruction?.eidStatus);
  const hasResult = Boolean(firstEid || result || status);
  const hasInput = hasIdentityInputFields(instruction);

  if (COMPLETE_ID_RESULTS.has(result) || COMPLETE_ID_RESULTS.has(status)) {
    return { status: 'complete' as const, hasInput, hasResult, canRun: false, blockedReason: null, label: firstText(firstEid?.EIDOverallResult, firstEid?.EIDStatus, 'Verified') };
  }

  if (status.includes('processing') || status.includes('pending')) {
    return { status: 'processing' as const, hasInput, hasResult, canRun: false, blockedReason: null, label: firstText(firstEid?.EIDStatus, 'Processing') };
  }

  if (result.includes('review') || result.includes('refer') || result.includes('consider') || result.includes('fail') || result.includes('reject')) {
    return { status: 'review' as const, hasInput, hasResult, canRun: false, blockedReason: null, label: firstText(firstEid?.EIDOverallResult, 'Review') };
  }

  if (!isInstructionSubmitted || isInstructionShell) {
    return { status: 'blocked' as const, hasInput, hasResult, canRun: false, blockedReason: 'Client has not submitted the instruction form yet', label: 'Waiting for submission' };
  }

  if (!hasInput) {
    return { status: 'blocked' as const, hasInput, hasResult, canRun: false, blockedReason: 'No identity details captured yet', label: 'Missing ID details' };
  }

  return { status: 'pending' as const, hasInput, hasResult, canRun: true, blockedReason: null, label: 'Ready to run' };
};

const evaluatePayments = (payments: WorkbenchItemRecord[]) => {
  let hasPayment = false;
  let hasSuccessful = false;
  let hasProcessing = false;
  let hasFailed = false;
  let latest: WorkbenchItemRecord | null = null;

  for (const payment of payments) {
    if (!latest) latest = payment;
    hasPayment = true;
    const paymentStatus = normalizeStatus(firstText(payment?.payment_status, payment?.paymentStatus, payment?.status, payment?.Status));
    const internalStatus = normalizeStatus(firstText(payment?.internal_status, payment?.internalStatus, payment?.InternalStatus));
    const isConfirmed = payment?.confirmed === true || payment?.Confirmed === true || paymentStatus === 'confirmed';
    if (SUCCESS_PAYMENT_STATUSES.has(paymentStatus) || internalStatus === 'completed' || internalStatus === 'paid' || isConfirmed) hasSuccessful = true;
    else if (PROCESSING_PAYMENT_STATUSES.has(paymentStatus) || internalStatus === 'processing') hasProcessing = true;
    else if (FAILED_PAYMENT_STATUSES.has(paymentStatus) || internalStatus === 'failed') hasFailed = true;
  }

  const amountRaw = latest?.amount ?? latest?.Amount ?? latest?.value ?? latest?.Value;
  const amount = typeof amountRaw === 'string' ? Number(amountRaw) : amountRaw;
  return {
    hasPayment,
    hasSuccessful,
    hasProcessing,
    hasFailed,
    amountText: Number.isFinite(amount) ? `£${Number(amount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}` : '',
  };
};

const buildStage = (stage: Omit<ProspectJourneyStageState, 'done' | 'inProgress' | 'blocked' | 'hasIssue'>): ProspectJourneyStageState => ({
  ...stage,
  done: stage.status === 'complete',
  inProgress: stage.status === 'processing',
  blocked: stage.status === 'blocked',
  hasIssue: stage.status === 'review' || stage.status === 'warning' || stage.status === 'blocked',
});

export const deriveProspectJourneyState = (input: ProspectJourneyInput): ProspectJourneyState => {
  const workbenchItem = input.workbenchItem || {};
  const instruction = workbenchItem.instruction ?? null;
  const deal = workbenchItem.deal ?? null;
  const enquiry = input.enquiry || workbenchItem.enquiry || workbenchItem.Enquiry || workbenchItem.enquiryRecord || workbenchItem.prospectEnquiry || null;
  const teamsData = input.enrichmentTeamsData || input.enrichmentData?.teamsData || workbenchItem.enrichmentTeamsData || null;
  const enrichmentPitchData = input.enrichmentPitchData || input.enrichmentData?.pitchData || workbenchItem.pitchData || null;
  const payments = Array.isArray(workbenchItem.payments) ? workbenchItem.payments : [];
  const eids = Array.isArray(workbenchItem.eids) ? workbenchItem.eids : [];
  const documents = Array.isArray(workbenchItem.documents) ? workbenchItem.documents : [];
  const matters = Array.isArray(workbenchItem.matters) ? workbenchItem.matters : [];
  const risk = workbenchItem.risk ?? null;

  const instructionRef = getInstructionRef(instruction, deal);
  const instructionStage = getInstructionStage(instruction, deal);
  const instructionSubmittedRaw = getInstructionSubmittedRaw(instruction, deal);
  const isInstructionShell = Boolean(instructionRef) && isInstructionShellStage(instructionStage);
  const hasAdvancedInstructionStage = Boolean(instructionStage && !isInstructionShellStage(instructionStage));
  const isInstructionSubmitted = Boolean(instructionRef && !isInstructionShell && (instructionSubmittedRaw || hasAdvancedInstructionStage || hasIdentityInputFields(instruction) || eids.length > 0));

  const claim = getClaimEvidence(enquiry, teamsData);
  const pitch = getPitchEvidence(workbenchItem, enrichmentPitchData);
  const identity = evaluateIdentity(instruction, workbenchItem.eid ?? null, eids, isInstructionSubmitted, isInstructionShell);
  const payment = evaluatePayments(payments);
  const riskResult = lower(risk?.RiskAssessmentResult || risk?.riskAssessmentResult || risk?.result);
  const hasMatter = Boolean(
    instruction?.MatterId || instruction?.matterId || instruction?.MatterRef || instruction?.matterRef ||
    instruction?.DisplayNumber || instruction?.displayNumber || matters.length > 0,
  );

  const orderedStages = [
    buildStage({
      key: 'claimed',
      label: 'Claimed',
      shortLabel: 'Claimed',
      status: claim.hasClaim ? 'complete' : 'pending',
      statusText: claim.hasClaim ? claim.label : 'Not claimed',
      title: claim.hasClaim ? claim.label : 'No fee earner claim yet',
      dateRaw: claim.dateRaw,
    }),
    buildStage({
      key: 'pitch',
      label: 'Pitch',
      shortLabel: 'Pitch',
      status: pitch.hasPitch ? 'complete' : (claim.hasClaim ? 'pending' : 'neutral'),
      statusText: pitch.hasPitch ? 'Pitch ready' : 'Not pitched',
      title: pitch.hasPitch ? 'Pitch/link exists' : 'No pitch or checkout link yet',
      dateRaw: pitch.dateRaw,
      details: pitch.details,
    }),
    buildStage({
      key: 'instruction',
      label: 'Instruction',
      shortLabel: 'Instruction',
      status: isInstructionSubmitted ? 'complete' : (instructionRef ? 'processing' : 'pending'),
      statusText: isInstructionSubmitted ? 'Submitted' : (instructionRef ? 'Checkout opened' : 'Not instructed'),
      title: isInstructionSubmitted ? `Instruction submitted${instructionRef ? ` (${instructionRef})` : ''}` : (instructionRef ? `Checkout opened, awaiting client submission (${instructionRef})` : 'Client has not instructed yet'),
      dateRaw: instructionSubmittedRaw,
      details: [
        { label: 'Ref', value: instructionRef },
        { label: 'Stage', value: instructionStage || (instructionRef ? 'initialised' : '') },
      ].filter((detail) => detail.value),
    }),
    buildStage({
      key: 'identity',
      label: 'ID Check',
      shortLabel: 'ID',
      status: identity.status,
      statusText: identity.label,
      title: identity.blockedReason || (identity.canRun ? 'Ready to run ID verification' : `ID ${identity.label}`),
    }),
    buildStage({
      key: 'payment',
      label: 'Payment',
      shortLabel: 'Pay',
      status: payment.hasSuccessful ? 'complete' : payment.hasFailed ? 'review' : payment.hasProcessing || payment.hasPayment ? 'processing' : 'pending',
      statusText: payment.hasSuccessful ? `Paid${payment.amountText ? ` ${payment.amountText}` : ''}` : payment.hasFailed ? 'Payment failed' : payment.hasPayment ? 'Payment pending' : 'No payment',
      title: payment.hasSuccessful ? 'Payment confirmed' : payment.hasPayment ? 'Payment recorded but not confirmed' : 'No payment recorded',
    }),
    buildStage({
      key: 'risk',
      label: 'Risk',
      shortLabel: 'Risk',
      status: riskResult ? (riskResult.includes('medium') ? 'warning' : riskResult.includes('high') ? 'review' : 'complete') : 'pending',
      statusText: riskResult ? firstText(risk?.RiskAssessmentResult, risk?.riskAssessmentResult, 'Recorded') : 'No risk record',
      title: riskResult ? 'Risk assessment recorded' : 'Risk assessment not started',
    }),
    buildStage({
      key: 'matter',
      label: 'Matter',
      shortLabel: 'Matter',
      status: hasMatter ? 'complete' : 'pending',
      statusText: hasMatter ? 'Matter opened' : 'No matter',
      title: hasMatter ? 'Matter linked or opened' : 'Matter not opened yet',
    }),
    buildStage({
      key: 'documents',
      label: 'Documents',
      shortLabel: 'Docs',
      status: documents.length > 0 ? 'complete' : 'neutral',
      statusText: documents.length > 0 ? `${documents.length} document${documents.length === 1 ? '' : 's'}` : 'No documents',
      title: documents.length > 0 ? 'Documents available' : 'No documents uploaded yet',
    }),
  ];

  const stages = orderedStages.reduce((acc, stage) => {
    acc[stage.key] = stage;
    return acc;
  }, {} as Record<ProspectJourneyStageKey, ProspectJourneyStageState>);
  const nextStage = orderedStages.find((stage) => stage.status === 'blocked' || stage.status === 'review' || stage.status === 'warning' || stage.status === 'processing' || stage.status === 'pending') || null;
  const currentStage = [...orderedStages].reverse().find((stage) => stage.status === 'complete' || stage.status === 'processing' || stage.status === 'blocked' || stage.status === 'review' || stage.status === 'warning') || null;

  return {
    stages,
    orderedStages,
    nextStageKey: nextStage?.key ?? null,
    currentStageKey: currentStage?.key ?? null,
    instructionRef,
    instructionStage,
    isInstructionShell,
    isInstructionSubmitted,
    hasPitchEvidence: pitch.hasPitch,
    hasIdentityInput: identity.hasInput,
    hasIdentityResult: identity.hasResult,
    canRunIdCheck: identity.canRun,
    idBlockedReason: identity.blockedReason,
  };
};
