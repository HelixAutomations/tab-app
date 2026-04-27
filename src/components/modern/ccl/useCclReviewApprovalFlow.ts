import React from 'react';
import { approveCcl, sendCclToClient, uploadToNetDocuments } from '../../../tabs/matters/ccl/cclAiService';
import type { CclStatus } from './cclStatus';

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
  setCclMap: React.Dispatch<React.SetStateAction<Record<string, CclStatus>>>;
  setCclSelectedReviewFieldByMatter: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCclJustApproved: React.Dispatch<React.SetStateAction<string | null>>;
  setCclLetterModal: React.Dispatch<React.SetStateAction<string | null>>;
  cclUploadingMatter: string | null;
  setCclUploadingMatter: React.Dispatch<React.SetStateAction<string | null>>;
  setCclUploadedMatter: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (options: CclToastOptions) => void;
}

export interface CclReviewApprovalHandlers {
  /** Stage 1 — Approve + send guarded internal copy. Does NOT touch NetDocuments. */
  handleApprove: () => Promise<void>;
  /** Stage 2 — Manual upload of the approved letter to NetDocuments. */
  handleUploadToNd: () => Promise<void>;
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
  cclUploadingMatter,
  setCclUploadingMatter,
  setCclUploadedMatter,
  showToast,
}: CreateCclReviewApprovalHandlerParams): CclReviewApprovalHandlers {
  const handleApprove = async () => {
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
        message: 'Luke received the CCL, Alex and the fee earner were copied. Choose what to do next: upload to NetDocuments or close.',
        duration: 4500,
      });

      setCclSelectedReviewFieldByMatter((prev) => {
        const next = { ...prev };
        delete next[matterId];
        return next;
      });

      setCclApprovalStep('');
      // Stage 1 is the entry point of a multi-step ceremony — leave the success
      // overlay mounted so the operator can explicitly choose: upload to ND, or
      // close. No auto-dismiss.
      setCclJustApproved(matterId);
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

  const handleUploadToNd = async () => {
    if (!matterId || cclUploadingMatter) return;

    setCclUploadingMatter(matterId);
    try {
      const ndResult = await uploadToNetDocuments({
        matterId,
        matterDisplayNumber: matterDisplayNumber || matterId,
        fields: structuredReviewFields,
      });

      if (!ndResult.ok) {
        showToast({
          type: 'error',
          title: 'NetDocuments upload failed',
          message: ndResult.error || 'Could not upload the approved letter. Try again or upload manually.',
          duration: 6500,
        });
        return;
      }

      setCclMap((prev) => ({
        ...prev,
        [matterId]: {
          ...prev[matterId],
          status: 'nd-uploaded',
          stage: 'nd-uploaded',
          label: 'ND uploaded',
          uploadedToNd: true,
        },
      }));
      setCclUploadedMatter(matterId);

      showToast({
        type: 'success',
        title: 'Uploaded to NetDocuments',
        message: 'The approved letter is filed in the matter workspace.',
        duration: 4000,
      });

      // Close the success overlay shortly after the ND step lands so the
      // operator returns to the dashboard cleanly.
      window.setTimeout(() => {
        setCclJustApproved((prev) => (prev === matterId ? null : prev));
        setCclUploadedMatter((prev) => (prev === matterId ? null : prev));
        setCclLetterModal((prev) => (prev === matterId ? null : prev));
      }, 1800);
    } catch (err) {
      console.error('[ccl] ND upload error:', err);
      showToast({
        type: 'error',
        title: 'NetDocuments upload error',
        message: 'Something went wrong uploading to NetDocuments. Try again.',
        duration: 6500,
      });
    } finally {
      setCclUploadingMatter(null);
    }
  };

  return { handleApprove, handleUploadToNd };
}