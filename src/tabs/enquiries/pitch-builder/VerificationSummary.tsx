import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@fluentui/react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { ProspectHeader } from '../components/ProspectHeader';
import { useTheme } from '../../../app/functionality/ThemeContext';

export interface VerificationSummaryProps {
  isDarkMode: boolean;
  userData: UserData[] | null | undefined;
  enquiry: Enquiry;
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
}

type PitchHistoryItem = {
  DealId?: number;
  InstructionRef?: string;
  ProspectId?: number;
  CreatedAt?: string;
  CreatedBy?: string;
  Amount?: number;
  ServiceDescription?: string;
  DealStatus?: string;
  Passcode?: string;
  InstructionStage?: string;
};

/**
 * Verification summary for Pitch Builder - shows prospect header + minimal inline hints.
 * Flattened design: no separate sections/cards above scenario selection.
 */
export const VerificationSummary: React.FC<VerificationSummaryProps> = ({
  userData,
  enquiry,
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
}) => {
  const { isDarkMode } = useTheme();

  const [pitchHistory, setPitchHistory] = useState<PitchHistoryItem[] | null>(null);
  const [pitchHistoryError, setPitchHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setPitchHistoryError(null);
        const res = await fetch(`/api/pitches/${encodeURIComponent(String(enquiry?.ID ?? ''))}`);
        if (!res.ok) throw new Error(`Failed to load pitch history (${res.status})`);
        const data = await res.json();
        const pitches = Array.isArray(data?.pitches) ? (data.pitches as PitchHistoryItem[]) : [];
        if (!cancelled) setPitchHistory(pitches);
      } catch (e: any) {
        if (!cancelled) {
          setPitchHistory([]);
          setPitchHistoryError(e?.message || 'Failed to load pitch history');
        }
      }
    };
    if (enquiry?.ID != null) void run();
    return () => {
      cancelled = true;
    };
  }, [enquiry?.ID]);

  const pitchContext = useMemo(() => {
    const list = pitchHistory ?? [];
    const open = list.filter((p) => !String(p?.InstructionStage ?? '').trim());
    return { notConverted: open.length };
  }, [pitchHistory]);

  const contextHint = useMemo(() => {
    if (pitchHistoryError) return null;
    if (pitchContext.notConverted > 0) {
      return `${pitchContext.notConverted} previous pitch${pitchContext.notConverted === 1 ? '' : 'es'} not yet converted`;
    }
    return null;
  }, [pitchHistoryError, pitchContext.notConverted]);

  const bannerColors = {
    bg: isDarkMode ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.05)',
    border: isDarkMode ? 'rgba(245, 158, 11, 0.5)' : 'rgba(245, 158, 11, 0.45)',
    text: '#f59e0b',
    prompt: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
  };

  return (
    <div>
      {/* Prospect Header - single unified header */}
      <ProspectHeader
        enquiry={enquiry}
        userData={userData ?? undefined}
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
        showFeeEarnerToggle
      />

      {/* Scenario prompt banner (inline workbench style) */}
      {contextHint && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 10,
            marginLeft: 4,
            marginRight: 4,
            padding: '8px 10px',
            background: bannerColors.bg,
            border: `1px solid ${bannerColors.border}`,
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: bannerColors.text, display: 'flex', alignItems: 'center' }}>
              <Icon iconName="Warning" style={{ fontSize: 12 }} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: bannerColors.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Pitch context
              </span>
              <span style={{ fontSize: 10, color: bannerColors.prompt }}>{contextHint}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationSummary;
