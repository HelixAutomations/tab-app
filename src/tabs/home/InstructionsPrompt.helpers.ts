import { InstructionData } from '../../app/functionality/types';
import type { InstructionSummary } from './InstructionsPrompt';

export function getActionableInstructions(
  data: InstructionData[],
  isLocalhost: boolean = false,
): InstructionSummary[] {
  const summaries: InstructionSummary[] = [];

  data.forEach((item) => {
    const instruction = item.instructions && item.instructions[0];
    if (!instruction) {
      return;
    }

    const matterLinked = instruction.MatterId || item.matter;
    if (matterLinked && !isLocalhost) {
      return;
    }

    const paymentStatus =
      instruction.PaymentResult?.toLowerCase() === 'successful' ||
      instruction.InternalStatus === 'paid' ||
      instruction.internalStatus === 'paid'
        ? 'complete' : 'pending';

    const eid = item.electronicIDChecks && item.electronicIDChecks[0];
    const idVerification = item.idVerifications && item.idVerifications[0];
    const eidResult = eid?.EIDOverallResult?.toLowerCase();
    const idVerificationResult = idVerification?.EIDOverallResult?.toLowerCase();
    const poidPassed = eidResult === 'passed' || idVerificationResult === 'passed' ||
      instruction.IdVerified || instruction.EIDOverallResult?.toLowerCase() === 'passed';
    const stageComplete = instruction?.Stage === 'proof-of-id-complete' || instruction?.stage === 'proof-of-id-complete';

    let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
    if (stageComplete) {
      if (eidResult === 'review') {
        verifyIdStatus = 'review';
      } else if (poidPassed || eidResult === 'passed') {
        verifyIdStatus = 'complete';
      } else {
        verifyIdStatus = 'received';
      }
    } else if (!eid && (!item.electronicIDChecks || item.electronicIDChecks.length === 0)) {
      const proofOfIdComplete = instruction?.proofOfIdComplete || instruction?.ProofOfIdComplete;
      verifyIdStatus = proofOfIdComplete ? 'received' : 'pending';
    } else if (poidPassed) {
      verifyIdStatus = 'complete';
    } else {
      verifyIdStatus = 'review';
    }

    const risk = item.riskAssessments && item.riskAssessments[0];
    const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? '';
    const riskStatus = riskResultRaw
      ? ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'review'
      : 'pending';

    const nextActionStep =
      verifyIdStatus !== 'complete' ? 'id' :
      paymentStatus !== 'complete' ? 'payment' :
      riskStatus !== 'complete' ? 'risk' :
      'complete';

    const needsMatterOpening = isLocalhost && !matterLinked &&
      verifyIdStatus === 'complete' &&
      paymentStatus === 'complete' &&
      riskStatus === 'complete';

    const hasIdReview = verifyIdStatus === 'review';
    const hasRiskReview = riskStatus === 'review';

    const needsUserAction =
      (nextActionStep === 'id' || nextActionStep === 'risk') ||
      hasIdReview || hasRiskReview || needsMatterOpening;

    if (!needsUserAction) {
      return;
    }

    const clientName = `${instruction.FirstName ?? ''} ${instruction.LastName ?? ''}`.trim();
    const service = item.deals?.[0]?.ServiceDescription || 'New Matter';

    let actionLabel = '';
    let isDisabled = false;

    if (hasIdReview) {
      actionLabel = 'Review ID';
    } else if (hasRiskReview) {
      actionLabel = 'Review Risk';
    } else if (needsMatterOpening) {
      actionLabel = 'Open Matter';
    } else if (nextActionStep === 'id') {
      actionLabel = 'Verify ID';
    } else if (nextActionStep === 'risk') {
      actionLabel = 'Assess Risk';
    } else {
      return;
    }

    summaries.push({
      id: instruction.InstructionRef ?? String(item.prospectId),
      clientName: clientName || 'Unknown Client',
      service,
      nextAction: actionLabel,
      disabled: isDisabled,
    });
  });

  return summaries;
}
