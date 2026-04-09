import type {
  WorkbenchItemRecord,
  WorkbenchStageStatus,
  WorkbenchStageStatuses,
} from './workbenchTypes';

type MediumRiskStatus = Extract<WorkbenchStageStatus, 'review' | 'warning'>;

interface WorkbenchStatusSource {
  instruction?: WorkbenchItemRecord | null;
  payments?: WorkbenchItemRecord[] | null;
  risk?: WorkbenchItemRecord | null;
  eid?: WorkbenchItemRecord | null;
  eids?: WorkbenchItemRecord[] | null;
  matters?: WorkbenchItemRecord[] | null;
  documents?: WorkbenchItemRecord[] | null;
  stageStatuses?: WorkbenchStageStatuses | null;
}

interface WorkbenchStatusOptions {
  mediumRiskStatus?: MediumRiskStatus;
}

const SUCCESS_PAYMENT_STATUSES = new Set(['succeeded', 'success', 'complete', 'completed', 'paid', 'confirmed']);
const PROCESSING_PAYMENT_STATUSES = new Set(['processing', 'requires_action', 'pending']);
const FAILED_PAYMENT_STATUSES = new Set(['failed']);
const COMPLETE_RISK_STATUSES = new Set(['low', 'low risk', 'pass', 'passed', 'approved', 'verified']);

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    const next = String(value ?? '').trim();
    if (next) return next;
  }
  return '';
};

const lower = (...values: unknown[]): string => firstString(...values).toLowerCase();

const hasVerifiedIdentity = (eidResult: string): boolean => (
  eidResult === 'passed' || eidResult === 'approved' || eidResult === 'verified' || eidResult === 'pass'
);

export const deriveWorkbenchStageStatuses = (
  source: WorkbenchStatusSource,
  options: WorkbenchStatusOptions = {},
): Required<WorkbenchStageStatuses> => {
  const instruction = source.instruction ?? null;
  const eid = source.eid ?? null;
  const eids = Array.isArray(source.eids) ? source.eids : [];
  const firstEid = eid ?? eids[0] ?? null;
  const payments = Array.isArray(source.payments) ? source.payments : [];
  const risk = source.risk ?? null;
  const matters = Array.isArray(source.matters) ? source.matters : [];
  const documents = Array.isArray(source.documents) ? source.documents : [];
  const stageStatuses = source.stageStatuses ?? {};
  const mediumRiskStatus = options.mediumRiskStatus ?? 'warning';

  const eidResult = lower(
    firstEid?.EIDOverallResult,
    firstEid?.eidOverallResult,
    instruction?.EIDOverallResult,
  );
  const eidStatus = lower(
    firstEid?.EIDStatus,
    firstEid?.eidStatus,
    instruction?.EIDStatus,
  );
  const instructionStage = lower(instruction?.Stage, instruction?.stage);
  const hasEidAttempt = Boolean(firstEid);
  const hasManualProof = Boolean(instruction?.PassportNumber || instruction?.DriversLicenseNumber);
  const isProofCompleteStage = instructionStage === 'proof-of-id-complete';
  const isLaterStage = isProofCompleteStage || instructionStage === 'completed' || instructionStage.includes('matter');

  let derivedIdentityStatus: WorkbenchStageStatus = 'pending';
  if (eidStatus.includes('processing')) {
    derivedIdentityStatus = 'processing';
  } else if (hasVerifiedIdentity(eidResult)) {
    derivedIdentityStatus = 'complete';
  } else if (
    eidResult.includes('review') ||
    eidResult.includes('refer') ||
    eidResult.includes('consider') ||
    eidResult.includes('failed') ||
    eidResult.includes('rejected') ||
    eidResult.includes('fail')
  ) {
    derivedIdentityStatus = 'review';
  } else if (hasManualProof && hasEidAttempt) {
    derivedIdentityStatus = 'review';
  } else if (hasEidAttempt && !eidStatus.includes('pending')) {
    derivedIdentityStatus = 'review';
  }

  if (isLaterStage && derivedIdentityStatus === 'pending') {
    derivedIdentityStatus = 'review';
  }

  let hasSuccessfulPayment = false;
  let hasProcessingPayment = false;
  let hasFailedPayment = false;
  for (const payment of payments) {
    const paymentStatus = lower(payment?.payment_status, payment?.paymentStatus, payment?.status, payment?.Status);
    const internalStatus = lower(payment?.internal_status, payment?.internalStatus, payment?.InternalStatus);
    const isConfirmed = payment?.confirmed === true || payment?.Confirmed === true || paymentStatus === 'confirmed';

    if (
      SUCCESS_PAYMENT_STATUSES.has(paymentStatus) ||
      internalStatus === 'completed' ||
      internalStatus === 'paid' ||
      isConfirmed
    ) {
      hasSuccessfulPayment = true;
      continue;
    }

    if (PROCESSING_PAYMENT_STATUSES.has(paymentStatus) || internalStatus === 'processing') {
      hasProcessingPayment = true;
      continue;
    }

    if (FAILED_PAYMENT_STATUSES.has(paymentStatus) || internalStatus === 'failed') {
      hasFailedPayment = true;
    }
  }

  let derivedPaymentStatus: WorkbenchStageStatus = 'pending';
  if (lower(instruction?.InternalStatus, instruction?.internalStatus) === 'paid' || hasSuccessfulPayment) {
    derivedPaymentStatus = 'complete';
  } else if (hasProcessingPayment) {
    derivedPaymentStatus = 'processing';
  } else if (hasFailedPayment) {
    derivedPaymentStatus = 'review';
  }

  const riskResult = lower(risk?.RiskAssessmentResult, risk?.riskAssessmentResult);
  let derivedRiskStatus: WorkbenchStageStatus = 'pending';
  if (riskResult) {
    if (COMPLETE_RISK_STATUSES.has(riskResult)) {
      derivedRiskStatus = 'complete';
    } else if (riskResult.includes('medium')) {
      derivedRiskStatus = mediumRiskStatus;
    } else {
      derivedRiskStatus = 'review';
    }
  }

  const hasMatter = Boolean(
    instruction?.MatterId ||
    instruction?.matterId ||
    instruction?.MatterRef ||
    instruction?.matterRef ||
    instruction?.DisplayNumber ||
    instruction?.displayNumber ||
    matters.length > 0,
  );

  return {
    id: stageStatuses.id ?? derivedIdentityStatus,
    payment: stageStatuses.payment ?? derivedPaymentStatus,
    risk: stageStatuses.risk ?? derivedRiskStatus,
    matter: stageStatuses.matter ?? (hasMatter ? 'complete' : 'pending'),
    documents: stageStatuses.documents ?? (documents.length > 0 ? 'complete' : 'neutral'),
  };
};