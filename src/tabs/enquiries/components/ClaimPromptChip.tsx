import React, { useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { claimEnquiry } from '../../../utils/claimEnquiry';
import { getAreaSpecificChannelUrl } from '../utils/enquiryHelpers';

export interface ClaimPromptChipProps {
  size?: 'default' | 'compact';
  teamsLink?: string | null;
  leadName?: string;
  areaOfWork?: string;
  enquiryId?: string;
  dataSource?: 'new' | 'legacy';
  iconOnly?: boolean;
  isDarkMode: boolean;
  currentUserEmail?: string;
  onOptimisticClaim?: (enquiryId: string, claimedBy: string) => void;
  onRefreshEnquiries?: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const ClaimPromptChip: React.FC<ClaimPromptChipProps> = ({
  size: sizeProp,
  teamsLink,
  leadName,
  areaOfWork,
  enquiryId,
  dataSource,
  iconOnly: iconOnlyProp,
  isDarkMode,
  currentUserEmail,
  onOptimisticClaim,
  onRefreshEnquiries,
  showToast,
}) => {
  const size = sizeProp ?? 'default';
  const iconOnly = iconOnlyProp ?? false;
  const metrics = size === 'compact'
    ? { padding: '4px 8px', fontSize: 9, iconSize: 10 }
    : { padding: '4px 10px', fontSize: 10, iconSize: 11 };
  const leadLabel = leadName?.trim() || 'this lead';

  const [isClaiming, setIsClaiming] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    if (enquiryId && currentUserEmail) {
      setIsClaiming(true);

      if (onOptimisticClaim) {
        onOptimisticClaim(enquiryId, currentUserEmail);
      }

      try {
        const result = await claimEnquiry(enquiryId, currentUserEmail, dataSource || 'new');

        if (result.success) {
          showToast('Enquiry claimed', 'success');
        } else {
          console.error('[ClaimPromptChip] Failed to claim enquiry:', result.error);
          if (onRefreshEnquiries) {
            await onRefreshEnquiries();
          }
        }
      } catch (err) {
        console.error('[ClaimPromptChip] Error claiming enquiry:', err);
        if (onRefreshEnquiries) {
          await onRefreshEnquiries();
        }
      } finally {
        setIsClaiming(false);
      }
    } else {
      const destination = (teamsLink || '').trim() || getAreaSpecificChannelUrl(areaOfWork);
      if (typeof window !== 'undefined') {
        window.open(destination, '_blank');
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isClaiming}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: iconOnly ? '0 6px' : metrics.padding,
        height: iconOnly ? 22 : 24,
        boxSizing: 'border-box',
        lineHeight: 1,
        borderRadius: 0,
        border: `1px solid ${isDarkMode ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 140, 0, 0.35)'}`,
        background: isDarkMode ? 'rgba(255, 140, 0, 0.10)' : 'rgba(255, 140, 0, 0.08)',
        color: colours.orange,
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.3px',
        fontSize: `${metrics.fontSize}px`,
        cursor: isClaiming ? 'wait' : 'pointer',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
        opacity: isClaiming ? 0.6 : 1,
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isClaiming) {
          e.currentTarget.style.background = isDarkMode ? 'rgba(255, 140, 0, 0.18)' : 'rgba(255, 140, 0, 0.14)';
          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 140, 0, 0.55)' : 'rgba(255, 140, 0, 0.5)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isClaiming) {
          e.currentTarget.style.background = isDarkMode ? 'rgba(255, 140, 0, 0.10)' : 'rgba(255, 140, 0, 0.08)';
          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 140, 0, 0.35)';
        }
      }}
      title={isClaiming ? 'Claiming...' : (enquiryId ? `Claim ${leadLabel}` : 'Open shared inbox channel in Teams')}
    >
      {!isClaiming && (
        <span
          style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isDarkMode ? 'rgba(255, 140, 0, 0.9)' : 'rgba(255, 140, 0, 0.85)',
            animation: 'status-breathe 2s ease-in-out infinite',
          }}
        />
      )}
      <Icon iconName={isClaiming ? 'Sync' : 'Contact'} styles={{ root: { fontSize: metrics.iconSize, color: 'inherit', animation: isClaiming ? 'spin 1s linear infinite' : 'none' } }} />
      {!iconOnly && <span>{isClaiming ? 'Claiming...' : 'Claim'}</span>}
    </button>
  );
};

export default React.memo(ClaimPromptChip);
