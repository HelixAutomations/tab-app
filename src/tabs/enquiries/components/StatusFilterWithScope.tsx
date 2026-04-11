import React from 'react';
import { colours } from '../../../app/styles/colours';

export type EnquiriesActiveState = '' | 'Claimed' | 'Claimable' | 'Triaged';

const filterIconSvg = (k: string) => {
  if (k === 'Claimed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (k === 'Unclaimed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 4V8.5L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (k === 'All') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M1 13c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M15 12.5c0-1.7-1.5-3-3.5-3-.7 0-1.3.15-1.8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  // Triaged
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5L2 3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

interface StatusFilterWithScopeProps {
  isDarkMode: boolean;
  activeState: string;
  showMineOnly: boolean;
  scopeCounts: { mineCount: number; allCount: number | null };
  isAdmin: boolean;
  isBusy: boolean;
  onSetActiveState: (key: EnquiriesActiveState) => void;
  onSetShowMineOnly: (v: boolean) => void;
}

const StatusFilterWithScope = React.memo<StatusFilterWithScopeProps>(({
  isDarkMode,
  activeState,
  showMineOnly,
  scopeCounts,
  isAdmin,
  isBusy,
  onSetActiveState,
  onSetShowMineOnly,
}) => {
  const h = 30;
  const currentState = activeState === 'Claimable' ? 'Unclaimed' : activeState;
  const isClaimed = currentState === 'Claimed';
  const claimedTone = isDarkMode ? colours.accent : colours.highlight;
  const triagedTone = colours.orange;

  const chipBg = (active: boolean, tone: string) =>
    active
      ? (tone === triagedTone
          ? (isDarkMode ? 'rgba(255,140,0,0.10)' : 'rgba(255,140,0,0.07)')
          : (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.07)'))
      : 'transparent';

  const chipStroke = (active: boolean, tone: string, admin?: boolean) =>
    active
      ? (isDarkMode && tone !== triagedTone ? 'rgba(135,243,243,0.34)' : tone)
      : admin
        ? (isDarkMode ? 'rgba(255,140,0,0.18)' : 'rgba(255,140,0,0.10)')
        : (isDarkMode ? 'rgba(75,85,99,0.22)' : 'rgba(0,0,0,0.08)');

  const chipColor = (active: boolean, tone: string) =>
    active
      ? tone
      : (isDarkMode ? '#d1d5db' : colours.greyText);

  const chipShadow = (active: boolean, tone: string, admin?: boolean) =>
    `inset 0 0 0 1px ${chipStroke(active, tone, admin)}`;

  const badgeBg = (active: boolean) =>
    active
      ? (isDarkMode ? 'rgba(54,144,206,0.22)' : 'rgba(54,144,206,0.14)')
      : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)');

  return (
    <div
      className="enq-filter-cluster enq-filter-constellation"
      data-busy={isBusy ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: h,
        padding: 0,
        background: 'transparent',
        borderRadius: 0,
        gap: 8,
        fontFamily: 'Raleway, sans-serif',
        userSelect: 'none',
      }}
    >
      <div className="enq-status-primary">
        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={isClaimed && showMineOnly}
          onClick={() => { onSetActiveState('Claimed'); onSetShowMineOnly(true); }}
          title={`My claimed (${scopeCounts.mineCount || 0})`}
          style={{
            minHeight: h,
            background: chipBg(isClaimed && showMineOnly, claimedTone),
            color: chipColor(isClaimed && showMineOnly, claimedTone),
            boxShadow: chipShadow(isClaimed && showMineOnly, claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Claimed')}</span>
          <span className="enq-chip-label">Mine</span>
          <span className="enq-badge" key={`mine-${scopeCounts.mineCount}`} data-animate style={{ background: badgeBg(isClaimed && showMineOnly) }}>{scopeCounts.mineCount}</span>
        </button>

        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={isClaimed && !showMineOnly}
          onClick={() => { onSetActiveState('Claimed'); onSetShowMineOnly(false); }}
          title={`All claimed${scopeCounts.allCount !== null ? ` (${scopeCounts.allCount})` : ''}`}
          style={{
            minHeight: h,
            background: chipBg(isClaimed && !showMineOnly, claimedTone),
            color: chipColor(isClaimed && !showMineOnly, claimedTone),
            boxShadow: chipShadow(isClaimed && !showMineOnly, claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('All')}</span>
          <span className="enq-chip-label">All</span>
          <span className="enq-badge" key={`all-${scopeCounts.allCount}`} data-animate style={{ background: badgeBg(isClaimed && !showMineOnly) }}>
            {scopeCounts.allCount !== null ? (
              <span style={{ display: 'inline-block' }}>{scopeCounts.allCount.toLocaleString()}</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, animation: 'badge-breathe 1.6s ease-in-out infinite' }}>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          className="enq-chip"
          aria-pressed={currentState === 'Unclaimed'}
          onClick={() => onSetActiveState('Claimable')}
          style={{
            height: h,
            fontWeight: currentState === 'Unclaimed' ? 600 : 500,
            background: chipBg(currentState === 'Unclaimed', claimedTone),
            color: chipColor(currentState === 'Unclaimed', claimedTone),
            boxShadow: chipShadow(currentState === 'Unclaimed', claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Unclaimed')}</span>
          <span className="enq-chip-label">Unclaimed</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className="enq-chip"
            aria-pressed={currentState === 'Triaged'}
            onClick={() => onSetActiveState('Triaged')}
            title="Admin only"
            style={{
              height: h,
              fontWeight: currentState === 'Triaged' ? 600 : 500,
              background: chipBg(currentState === 'Triaged', triagedTone),
              color: chipColor(currentState === 'Triaged', triagedTone),
              boxShadow: chipShadow(currentState === 'Triaged', triagedTone, true),
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Triaged')}</span>
            <span className="enq-chip-label">Triaged</span>
          </button>
        )}
      </div>
    </div>
  );
});

export default StatusFilterWithScope;
