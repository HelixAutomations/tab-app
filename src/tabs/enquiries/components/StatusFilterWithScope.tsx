import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Callout, DirectionalHint } from '@fluentui/react/lib/Callout';
import { FiCheckCircle, FiClock, FiUsers, FiFilter, FiChevronDown } from 'react-icons/fi';
import { colours } from '../../../app/styles/colours';

if (typeof document !== 'undefined' && !document.head.querySelector('style[data-enq-mine-scope-menu-scroll]')) {
  const style = document.createElement('style');
  style.setAttribute('data-enq-mine-scope-menu-scroll', 'true');
  style.textContent = `
    .enq-mine-scope-menu-scroll {
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .enq-mine-scope-menu-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  `;
  document.head.appendChild(style);
}

export type EnquiriesActiveState = '' | 'Claimed' | 'Claimable' | 'Triaged';

// Feather icons at strokeWidth 1.8 — matches the nav bar family (CustomTabs)
// so the whole top chrome reads as one stroke weight.
const filterIconSvg = (k: string) => {
  const size = 14;
  const strokeWidth = 1.8;
  if (k === 'Claimed') return <FiCheckCircle size={size} strokeWidth={strokeWidth} />;
  if (k === 'Unclaimed') return <FiClock size={size} strokeWidth={strokeWidth} />;
  if (k === 'All') return <FiUsers size={size} strokeWidth={strokeWidth} />;
  return <FiFilter size={size} strokeWidth={strokeWidth} />;
};

interface StatusFilterWithScopeProps {
  isDarkMode: boolean;
  activeState: string;
  showMineOnly: boolean;
  scopeCounts: { mineCount: number; allCount: number | null };
  isAdmin: boolean;
  isBusy: boolean;
  mineChipLabel?: string;
  mineChipTitle?: string;
  selectedMineScopeEmail?: string;
  mineScopeOptions?: Array<{
    email: string;
    label: string;
    fullLabel: string;
    initials: string;
    isSelf: boolean;
  }>;
  onSetActiveState: (key: EnquiriesActiveState) => void;
  onSetShowMineOnly: (v: boolean) => void;
  onSetMineScopeEmail?: (email: string) => void;
}

const StatusFilterWithScope = React.memo<StatusFilterWithScopeProps>(({
  isDarkMode,
  activeState,
  showMineOnly,
  scopeCounts,
  isAdmin,
  isBusy,
  mineChipLabel,
  mineChipTitle,
  selectedMineScopeEmail,
  mineScopeOptions,
  onSetActiveState,
  onSetShowMineOnly,
  onSetMineScopeEmail,
}) => {
  const [isMineScopeMenuOpen, setMineScopeMenuOpen] = useState(false);
  const mineScopeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const h = 30;
  const currentState = activeState === 'Claimable' ? 'Unclaimed' : activeState;
  const isClaimed = currentState === 'Claimed';
  const claimedTone = isDarkMode ? colours.accent : colours.highlight;
  const triagedTone = colours.orange;
  const canChooseMineScope = Boolean(onSetMineScopeEmail && mineScopeOptions && mineScopeOptions.length > 0);
  const selectedMineScope = useMemo(() => {
    const currentEmail = String(selectedMineScopeEmail || '').trim().toLowerCase();
    if (!currentEmail) return null;
    return mineScopeOptions?.find((option) => option.email === currentEmail) || null;
  }, [mineScopeOptions, selectedMineScopeEmail]);
  const currentMineLabel = mineChipLabel || selectedMineScope?.label || 'Mine';
  const currentMineTitle = mineChipTitle || selectedMineScope?.fullLabel || currentMineLabel;

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

  const splitChipSeparator = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
  const menuBackground = isDarkMode ? colours.darkBlue : '#ffffff';
  const menuBorder = isDarkMode ? 'rgba(75,85,99,0.48)' : 'rgba(6,23,51,0.10)';
  const menuShadow = isDarkMode ? '0 14px 28px rgba(0,3,25,0.48)' : '0 10px 24px rgba(6,23,51,0.12)';

  useEffect(() => {
    if (!canChooseMineScope) {
      setMineScopeMenuOpen(false);
    }
  }, [canChooseMineScope]);

  const handleShowMine = useCallback(() => {
    onSetActiveState('Claimed');
    onSetShowMineOnly(true);
  }, [onSetActiveState, onSetShowMineOnly]);

  const handleToggleMineScopeMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMineScopeMenuOpen((open) => !open);
  }, []);

  const handleMineScopeSelect = useCallback((email: string) => {
    handleShowMine();
    onSetMineScopeEmail?.(email);
    setMineScopeMenuOpen(false);
  }, [handleShowMine, onSetMineScopeEmail]);

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
        <div style={{ display: 'inline-flex', alignItems: 'stretch', gap: 0 }}>
          <button
            type="button"
            className="enq-scope-chip"
            aria-pressed={isClaimed && showMineOnly}
            onClick={handleShowMine}
            title={`${currentMineTitle} claimed (${scopeCounts.mineCount || 0})`}
            style={{
              minHeight: h,
              background: chipBg(isClaimed && showMineOnly, claimedTone),
              color: chipColor(isClaimed && showMineOnly, claimedTone),
              boxShadow: chipShadow(isClaimed && showMineOnly, claimedTone),
              paddingRight: canChooseMineScope ? 8 : 10,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Claimed')}</span>
            <span className="enq-chip-label">{currentMineLabel}</span>
            <span className="enq-badge" key={`mine-${scopeCounts.mineCount}`} data-animate style={{ background: badgeBg(isClaimed && showMineOnly) }}>{scopeCounts.mineCount}</span>
          </button>

          {canChooseMineScope && (
            <>
              <button
                ref={mineScopeAnchorRef}
                type="button"
                className="enq-scope-chip"
                aria-label={`Choose whose claimed prospects to show. Current: ${currentMineTitle}`}
                aria-haspopup="dialog"
                aria-expanded={isMineScopeMenuOpen}
                onClick={handleToggleMineScopeMenu}
                title={`Choose whose claimed prospects to show. Current: ${currentMineTitle}`}
                style={{
                  minHeight: h,
                  minWidth: 28,
                  padding: '0 7px',
                  marginLeft: -1,
                  background: chipBg(isClaimed && showMineOnly, claimedTone),
                  color: chipColor(isClaimed && showMineOnly, claimedTone),
                  boxShadow: `${chipShadow(isClaimed && showMineOnly, claimedTone)}, inset 1px 0 0 ${splitChipSeparator}`,
                }}
              >
                <FiChevronDown
                  size={12}
                  strokeWidth={2}
                  style={{
                    transform: isMineScopeMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.16s ease',
                  }}
                />
              </button>

              {isMineScopeMenuOpen && mineScopeAnchorRef.current && (
                <Callout
                  target={mineScopeAnchorRef.current}
                  onDismiss={() => setMineScopeMenuOpen(false)}
                  directionalHint={DirectionalHint.bottomLeftEdge}
                  directionalHintFixed
                  gapSpace={6}
                  setInitialFocus
                  styles={{
                    beak: { background: menuBackground },
                    calloutMain: {
                      background: menuBackground,
                      borderRadius: 0,
                      border: `1px solid ${menuBorder}`,
                      boxShadow: menuShadow,
                      maxWidth: 'calc(100vw - 24px)',
                      maxHeight: 'calc(100vh - 24px)',
                      overflow: 'hidden',
                    },
                  }}
                >
                  <div
                    data-helix-region="enquiries/claimed-scope-menu"
                    style={{
                      width: 'min(320px, calc(100vw - 24px))',
                      minWidth: 0,
                      maxWidth: 'calc(100vw - 24px)',
                      padding: 8,
                      background: menuBackground,
                      color: isDarkMode ? colours.dark.text : colours.darkBlue,
                    }}
                  >
                    <div
                      style={{
                        padding: '2px 4px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: isDarkMode ? colours.accent : colours.highlight,
                      }}
                    >
                      View claimed as:
                    </div>

                    <div
                      className="enq-mine-scope-menu-scroll"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        maxHeight: 'min(380px, calc(100vh - 140px))',
                      }}
                    >
                      {mineScopeOptions?.map((option) => {
                        const isSelected = option.email === String(selectedMineScopeEmail || '').trim().toLowerCase();
                        return (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => handleMineScopeSelect(option.email)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              width: '100%',
                              padding: '8px 10px',
                              background: isSelected
                                ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)')
                                : 'transparent',
                              border: 'none',
                              boxShadow: `inset 0 0 0 1px ${isSelected
                                ? (isDarkMode ? 'rgba(135,243,243,0.34)' : colours.highlight)
                                : (isDarkMode ? 'rgba(75,85,99,0.22)' : 'rgba(0,0,0,0.08)')}`,
                              color: isSelected
                                ? (isDarkMode ? colours.dark.text : colours.darkBlue)
                                : (isDarkMode ? '#d1d5db' : colours.greyText),
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontFamily: 'Raleway, sans-serif',
                            }}
                          >
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: isSelected ? 700 : 600 }}>
                              {option.fullLabel}
                            </span>
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: isSelected
                                  ? (isDarkMode ? colours.accent : colours.highlight)
                                  : (isDarkMode ? colours.subtleGrey : colours.greyText),
                              }}
                            >
                              {option.isSelf ? 'You' : option.initials}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Callout>
              )}
            </>
          )}
        </div>

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
