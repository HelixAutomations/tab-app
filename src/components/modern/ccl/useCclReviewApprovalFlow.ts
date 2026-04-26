import React from 'react';
import { approveCcl, sendCclToClient, uploadToNetDocuments } from '../../../tabs/matters/ccl/cclAiService';

interface CclStatusEntry {
  status?: string;
  stage?: string;
  label?: string;
  finalizedAt?: string;
  sentAt?: string;
  sentBy?: string;
  sentChannel?: string;
  [key: string]: unknown;
}

interface CclToastOptions {
  type: 'success' | 'error';
  title: string;
  message: string;
  duration?: number;
}

interface CreateCclReviewApprovalHandlerParams {
  matterId: string | null;
  matterDisplayNumber?: string | null;
  structuredReviewFields: Record<string, string>;
  cclApprovingMatter: string | null;
  setCclApprovingMatter: React.Dispatch<React.SetStateAction<string | null>>;
  setCclApprovalStep: React.Dispatch<React.SetStateAction<string>>;
  setCclMap: React.Dispatch<React.SetStateAction<Record<string, CclStatusEntry>>>;
  setCclSelectedReviewFieldByMatter: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCclJustApproved: React.Dispatch<React.SetStateAction<string | null>>;
  setCclLetterModal: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (options: CclToastOptions) => void;
}

export default function createCclReviewApprovalHandler({
  matterId,
  matterDisplayNumber,
  structuredReviewFields,
  cclApprovingMatter,
  setCclApprovingMatter,
  setCclApprovalStep,
  setCclMap,
  setCclSelectedReviewFieldByMatter,
  setCclJustApproved,
  setCclLetterModal,
  showToast,
}: CreateCclReviewApprovalHandlerParams) {
  return async () => {
    if (!matterId || cclApprovingMatter) return;

    setCclApprovingMatter(matterId);
    setCclApprovalStep('Finalising your letter…');

    try {
      const result = await approveCcl(matterId, 'approved');
      if (!result.ok) {
        showToast({
          type: 'error',
          title: 'Approval failed',
          message: result.error || 'Could not approve letter.',
          duration: 5000,
        });
        return;
      }

      const finalizedAt = result.finalizedAt || new Date().toISOString();
      setCclMap((prev) => ({
        ...prev,
        [matterId]: {
          ...prev[matterId],
          status: 'reviewed',
          stage: 'reviewed',
          label: 'Reviewed',
          finalizedAt,
        },
      }));

      setCclApprovalStep('Uploading to NetDocuments…');
      try {
        await uploadToNetDocuments({
          matterId,
          matterDisplayNumber: matterDisplayNumber || matterId,
          fields: structuredReviewFields,
        });
      } catch (ndErr) {
        console.warn('[ccl] ND upload after approval failed (non-blocking):', ndErr);
      }

      setCclApprovalStep('Sending internal copy…');
      const guardedSend = await sendCclToClient({ matterId });
      if (!guardedSend.ok) {
        showToast({
          type: 'error',
          title: 'Internal send failed',
          message: guardedSend.error || 'Letter approved, but the internal-only send did not complete. The client was not emailed.',
          duration: 6500,
        });
        return;
      }

      setCclMap((prev) => ({
        ...prev,
        [matterId]: {
          ...prev[matterId],
          status: 'sent',
          stage: 'sent',
          label: guardedSend.sentChannel === 'internal-guarded' ? 'Sent internal' : 'Sent',
          finalizedAt,
          sentAt: guardedSend.sentAt || new Date().toISOString(),
          sentBy: guardedSend.sentBy || undefined,
          sentChannel: guardedSend.sentChannel || undefined,
        },
      }));

      showToast({
        type: 'success',
        title: 'Internal copy sent',
        message: 'Luke received the CCL, Alex and the fee earner were copied, and the client was excluded by the current guard.',
        duration: 4500,
      });

      setCclSelectedReviewFieldByMatter((prev) => {
        const next = { ...prev };
        delete next[matterId];
        return next;
      });

      setCclApprovalStep('');
      setCclJustApproved(matterId);
      window.setTimeout(() => {
        setCclJustApproved((prev) => (prev === matterId ? null : prev));
        setCclLetterModal((prev) => (prev === matterId ? null : prev));
      }, 2200);
    } catch (err) {
      console.error('[ccl] Approval error:', err);
      showToast({
        type: 'error',
        title: 'Approval error',
        message: 'Something went wrong approving this letter.',
        duration: 5000,
      });
    } finally {
      setCclApprovingMatter(null);
      setCclApprovalStep('');
    }
  };
}