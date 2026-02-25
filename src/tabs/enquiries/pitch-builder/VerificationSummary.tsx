import React from 'react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { ProspectHeader } from '../components/ProspectHeader';

export interface VerificationSummaryProps {
  isDarkMode: boolean;
  userData: UserData[] | null | undefined;
  enquiry: Enquiry;
  isLoading?: boolean;
  amount?: string | number;
  initialScopeDescription?: string;
  linkActivationMode?: 'pitch' | 'manual';
  onLinkActivationModeChange?: (mode: 'pitch' | 'manual') => void;
  onInitialScopeDescriptionChange?: (value: string) => void;
  onAmountChange?: (value: string) => void;
  passcode?: string;
  usedPitchRoute: boolean;
  onPreview?: (link: string) => void;
  dealStatus?: 'idle' | 'processing' | 'ready' | 'error';
  dealCreationInProgress?: boolean;
  onCaptureDealForLink?: () => Promise<string | null>;
  noAmountMode?: boolean;
  onNoAmountModeChange?: (value: boolean) => void;
}

/**
 * Verification summary for Pitch Builder - shows prospect header + minimal inline hints.
 * Flattened design: no separate sections/cards above scenario selection.
 */
export const VerificationSummary: React.FC<VerificationSummaryProps> = ({
  userData,
  enquiry,
  isLoading,
  amount,
  initialScopeDescription,
  linkActivationMode,
  onLinkActivationModeChange,
  onInitialScopeDescriptionChange,
  onAmountChange,
  passcode,
  dealStatus,
  dealCreationInProgress,
  onCaptureDealForLink,
  noAmountMode,
  onNoAmountModeChange,
}) => {
  const isHeaderLoading = isLoading ?? !enquiry?.ID;

  return (
    <div>
      {/* Prospect Header - single unified header */}
      <ProspectHeader
        enquiry={enquiry}
        userData={userData ?? undefined}
        isLoading={isHeaderLoading}
        passcode={passcode}
        amount={amount}
        initialScopeDescription={initialScopeDescription}
        notes={enquiry?.Initial_first_call_notes}
        linkActivationMode={linkActivationMode}
        onLinkActivationModeChange={onLinkActivationModeChange}
        onInitialScopeDescriptionChange={onInitialScopeDescriptionChange}
        onAmountChange={onAmountChange}
        dealStatus={dealStatus}
        dealCreationInProgress={dealCreationInProgress}
        onCaptureDealForLink={onCaptureDealForLink}
        noAmountMode={noAmountMode}
        onNoAmountModeChange={onNoAmountModeChange}
        showFeeEarnerToggle
      />

    </div>
  );
};

export default VerificationSummary;
