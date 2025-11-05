import React, { useState, useEffect, useRef } from 'react';
import { Icon, MessageBar, MessageBarType } from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { parseISO, isToday, format } from 'date-fns';

// Live breakdown: Y, M, W, D, H, with minutes for same day and seconds if under 1 hour
function formatLiveBreakdown(from: Date, now: Date = new Date()): string {
  let diff = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const totalSeconds = diff;
  const S = diff % 60; diff = Math.floor(diff / 60);
  const M = diff % 60; diff = Math.floor(diff / 60);
  const H = diff % 24; diff = Math.floor(diff / 24);
  const D = diff % 7; diff = Math.floor(diff / 7);
  const W = diff % 4; diff = Math.floor(diff / 4);
  const Mo = diff % 12; diff = Math.floor(diff / 12);
  const Y = diff;
  
  const isUnderOneHour = totalSeconds < 3600; // Less than 1 hour
  const isSameDay = from.toDateString() === now.toDateString(); // Same calendar day

  const totalMonths = Y * 12 + Mo;
  const displayParts: string[] = [];

  if (totalMonths > 0) {
    displayParts.push(totalMonths + 'M');
    if (W > 0) displayParts.push(W + 'W');
  } else if (W > 0) {
    displayParts.push(W + 'W');
    if (D > 0) displayParts.push(D + 'D');
  } else if (D > 0) {
    displayParts.push(D + 'D');
    if (H > 0) displayParts.push(H + 'H');
  } else if (H > 0) {
    displayParts.push(H + 'H');
    if (isSameDay && M > 0) displayParts.push(M + 'M');
  } else if (M > 0) {
    displayParts.push(M + 'M');
    if (isUnderOneHour && S > 0) displayParts.push(S + 'S');
  } else if (isUnderOneHour && S > 0) {
    displayParts.push(S + 'S');
  }

  if (displayParts.length === 0) displayParts.push('0M');

  return displayParts.slice(0, 2).join(' ');
}

/**
 * Live ticking badge showing multi-unit age (Y M W D H M S).
 */
function LiveEnquiryAgeBadge({ enquiry }: { enquiry: Enquiry | any }) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rawTs: string | undefined = (enquiry as any).datetime || enquiry.Date_Created || (enquiry as any).Touchpoint_Date;
  if (!rawTs) return null;
  
  let dateObj: Date | null = null;
  try {
    dateObj = parseISO(rawTs);
    if (isNaN(dateObj.getTime())) dateObj = new Date(rawTs);
  } catch {
    try { dateObj = new Date(rawTs); } catch { dateObj = null; }
  }
  if (!dateObj || isNaN(dateObj.getTime())) return null;

  const liveStr = formatLiveBreakdown(dateObj, now);
  return (
    <span
      style={{
        fontSize: 9.5,
        color: 'rgba(117, 132, 158, 0.95)',
  fontWeight: 500,
        letterSpacing: 0.5,
        userSelect: 'all',
        fontFamily: 'Consolas, Monaco, monospace',
  background: 'rgba(148, 174, 220, 0.12)',
        borderRadius: 4,
        padding: '2px 6px',
        display: 'inline-block',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        opacity: 0.95
      }}
      title={format(dateObj, 'yyyy-MM-dd HH:mm')}
    >{liveStr}</span>
  );
}

interface TeamDataRec {
  Email?: string;
  Initials?: string;
  'Full Name'?: string;
}

interface Props {
  enquiry: Enquiry & { __sourceType?: 'new' | 'legacy' };
  claimer?: TeamDataRec | undefined;
  isClaimed?: boolean;
  showPulse?: boolean;
  onAreaChange?: (enquiryId: string, newArea: string) => void | Promise<void>;
}

/**
 * EnquiryBadge
 * Clean, unified pill component for the top-right badge area with cascade animation.
 * Apple-style single container housing area + dates + claimer.
 */
const EnquiryBadge: React.FC<Props> = ({ 
  enquiry, 
  claimer, 
  isClaimed = false,
  showPulse = false,
  onAreaChange
}) => {
  const { isDarkMode } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [showAreaMenu, setShowAreaMenu] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [localArea, setLocalArea] = useState(enquiry.Area_of_Work || '');

  // Cascade animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearInterval(timer);
  }, []);

  // Update local area when enquiry changes
  useEffect(() => {
    setLocalArea(enquiry.Area_of_Work || '');
  }, [enquiry.Area_of_Work]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const nowYear = new Date().getFullYear();
      return d.toLocaleDateString('en-GB', d.getFullYear() === nowYear ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  };

  const areaColor = (() => {
    const area = localArea?.toLowerCase() || '';
    if (area.includes('commercial')) return colours.blue;
    if (area.includes('construction')) return colours.orange;
    if (area.includes('property')) return colours.green;
    if (area.includes('employment')) return colours.yellow;
    if (area.includes('other') || area.includes('unsure')) return colours.greyText;
    return colours.greyText;
  })();

  const areaIconName = (() => {
    const a = localArea?.toLowerCase() || '';
    if (a.includes('commercial')) return 'CityNext'; // Commercial law - business/work
    if (a.includes('construction')) return 'Build';
    if (a.includes('property')) return 'Home';
    if (a.includes('employment')) return 'People';
    if (a.includes('other') || a.includes('unsure')) return 'Help';
    return 'Help';
  })();

  const badgeBorder = `1px solid ${areaColor}`;
  const badgeBackground = isDarkMode ? '#1e293b' : 'rgba(255,255,255,0.95)';
  const badgeShadow = 'none'; // Simplified - no shadows
  const neutralText = isDarkMode ? 'rgba(255,255,255,0.88)' : 'rgba(18,34,54,0.88)';
  const subtleText = isDarkMode ? 'rgba(225,232,245,0.8)' : 'rgba(76,90,110,0.85)';

  const isNewData = enquiry.__sourceType === 'new' || ((enquiry as any).datetime && (enquiry as any).claim);
  
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle area change
  const handleAreaChange = async (newArea: string) => {
    if (!onAreaChange || isUpdating) return;
    
    setIsUpdating(true);
    setLocalArea(newArea); // Optimistic update
    setShowAreaMenu(false);
    
    try {
      await onAreaChange(enquiry.ID, newArea);
      // Success feedback handled by parent
    } catch (error) {
      console.error('Failed to update area:', error);
      setLocalArea(enquiry.Area_of_Work || ''); // Revert on error
    } finally {
      setIsUpdating(false);
    }
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAreaMenu(false);
      }
    };
    if (showAreaMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAreaMenu]);

  const areaOptions = [
    { value: 'Commercial', color: colours.blue, icon: 'CityNext' },
    { value: 'Construction', color: colours.orange, icon: 'Build' },
    { value: 'Property', color: colours.green, icon: 'Home' },
    { value: 'Employment', color: colours.yellow, icon: 'People' },
    { value: 'Other', color: colours.greyText, icon: 'Help' }
  ];

  return (
    <>
      {/* Single unified pill container - compact design */}
      <div ref={menuRef} style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        background: badgeBackground,
        border: badgeBorder,
        fontSize: 10.5,
        fontWeight: 500,
        opacity: isVisible ? 0.97 : 0,
        transform: isVisible ? 'translateX(0) scale(1)' : 'translateX(8px) scale(0.99)',
        transition: 'opacity 0.35s ease, transform 0.35s ease, background 0.3s ease, border-color 0.3s ease',
        boxShadow: badgeShadow
      }}>
        {/* Area icon + label - clickable for reassignment */}
        {(() => {
          const aow = localArea?.toLowerCase() || '';
          if (!localArea) return null;
          
          // Determine display text
          let displayText = localArea;
          if (aow.includes('facebook') || aow.includes('lead') || aow.includes('source') || aow.includes('other') || aow.includes('unsure')) {
            displayText = 'Other';
          }
          
          return (
            <div style={{ position: 'relative' }}>
              <div
                onClick={(e) => {
                  if (onAreaChange) {
                    e.stopPropagation();
                    setShowAreaMenu(!showAreaMenu);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: areaColor,
                  padding: '2px 4px',
                  borderRadius: 5,
                  cursor: onAreaChange ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  background: showAreaMenu ? `${areaColor}15` : 'transparent',
                  opacity: isUpdating ? 0.5 : 1,
                  pointerEvents: isUpdating ? 'none' : 'auto'
                }}
              >
                {isUpdating ? (
                  <Icon iconName="ProgressRingDots" styles={{ root: { fontSize: 12, animation: 'spin 1s linear infinite' } }} />
                ) : (
                  <Icon iconName={areaIconName} styles={{ root: { fontSize: 12, opacity: 0.9 } }} />
                )}
                <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10.5, fontWeight: 600 }}>
                  {displayText}
                </span>
                {onAreaChange && !isUpdating && (
                  <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, opacity: 0.6 } }} />
                )}
              </div>
              
              {/* Dropdown menu */}
              {showAreaMenu && onAreaChange && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: isDarkMode ? '#1e293b' : '#ffffff',
                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.1)'}`,
                  borderRadius: 8,
                  boxShadow: isDarkMode 
                    ? '0 4px 16px rgba(0,0,0,0.4)' 
                    : '0 4px 16px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  zIndex: 1000,
                  minWidth: 140
                }}>
                  {areaOptions.map(option => (
                    <div
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAreaChange(option.value);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: localArea === option.value 
                          ? `${option.color}15` 
                          : 'transparent',
                        borderLeft: `3px solid ${localArea === option.value ? option.color : 'transparent'}`,
                        transition: 'all 0.15s ease',
                        color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
                        fontSize: 11,
                        fontWeight: 500
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${option.color}20`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = localArea === option.value 
                          ? `${option.color}15` 
                          : 'transparent';
                      }}
                    >
                      <Icon 
                        iconName={option.icon} 
                        styles={{ root: { fontSize: 12, color: option.color } }} 
                      />
                      <span>{option.value}</span>
                      {localArea === option.value && (
                        <Icon 
                          iconName="CheckMark" 
                          styles={{ root: { fontSize: 10, color: option.color, marginLeft: 'auto' } }} 
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Separator dot - more subtle (only show if area was displayed) */}
        {(() => {
          const aow = enquiry.Area_of_Work?.toLowerCase() || '';
          const shouldShowArea = enquiry.Area_of_Work && 
            !aow.includes('facebook') && 
            !aow.includes('lead') && 
            !aow.includes('source');
          
          return shouldShowArea ? (
            <span style={{ 
              width: 2, 
              height: 2, 
              borderRadius: '50%', 
              background: `${areaColor}50`
            }} />
          ) : null;
        })()}

        {/* Date section - timeline effect for claimed new data */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          color: subtleText,
          fontSize: 9.5
        }}>
          {isClaimed ? (
            // Claimed: timeline effect for new, single date + tick for legacy
            isNewData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span title="Enquiry received" style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                  {formatDate((enquiry as any).datetime)}
                </span>
                <Icon iconName="ChevronRight" styles={{ root: { fontSize: 8, opacity: 0.5 } }} />
                <span title="Claimed" style={{ opacity: 1, whiteSpace: 'nowrap' }}>
                  {formatDate((enquiry as any).claim)}
                </span>
                {/* Show time taken to claim */}
                {(() => {
                  try {
                    const enquiryDate = new Date((enquiry as any).datetime);
                    const claimDate = new Date((enquiry as any).claim);
                    if (!isNaN(enquiryDate.getTime()) && !isNaN(claimDate.getTime())) {
                      const timeTaken = formatLiveBreakdown(enquiryDate, claimDate);
                      return (
                        <span
                          style={{
                            fontSize: 9,
                            color: '#b0b8c9',
                            fontWeight: 500,
                            letterSpacing: 0.8,
                            fontFamily: 'Consolas, Monaco, monospace',
                            background: 'rgba(180,200,255,0.1)',
                            borderRadius: 4,
                            padding: '1px 4px',
                            opacity: 0.9,
                            marginLeft: 4
                          }}
                          title={`Time taken to claim: ${timeTaken}`}
                        >
                          {timeTaken}
                        </span>
                      );
                    }
                  } catch {}
                  return null;
                })()}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ whiteSpace: 'nowrap' }}>{formatDate(enquiry.Touchpoint_Date)}</span>
                <Icon iconName="CheckMark" styles={{ root: { fontSize: 10, color: colours.blue } }} />
              </div>
            )
          ) : (
            // Unclaimed: just the enquiry date + live age
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ whiteSpace: 'nowrap', color: neutralText }}>{formatDate(isNewData ? (enquiry as any).datetime : enquiry.Touchpoint_Date)}</span>
              {!isClaimed && <LiveEnquiryAgeBadge enquiry={enquiry} />}
            </div>
          )}
        </div>

        {/* Claimer initials */}
        {claimer && (
          <>
            <span style={{ 
              width: 2, 
              height: 2, 
              borderRadius: '50%', 
              background: `${areaColor}66`
            }} />
            <div style={{ 
              width: 22, 
              height: 22, 
              borderRadius: '50%', 
              background: `${areaColor}14`,
              color: areaColor, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontWeight: 600, 
              fontSize: 9.5,
              border: `1px solid ${areaColor}32`
            }}>
              {claimer.Initials || claimer.Email?.split('@')[0]?.slice(0,2).toUpperCase()}
            </div>
          </>
        )}
      </div>

      {/* Inject keyframes once */}
      {(() => {
        if (typeof document !== 'undefined') {
          if (showPulse && !document.getElementById('pulseEnquiryKeyframes')) {
            const pulseEl = document.createElement('style');
            pulseEl.id = 'pulseEnquiryKeyframes';
            pulseEl.textContent = '@keyframes pulseEnquiry {0%{transform:scale(.85);opacity:.6}50%{transform:scale(1.25);opacity:1}100%{transform:scale(.85);opacity:.6}}';
            document.head.appendChild(pulseEl);
          }
          if (!document.getElementById('spinKeyframes')) {
            const spinEl = document.createElement('style');
            spinEl.id = 'spinKeyframes';
            spinEl.textContent = '@keyframes spin {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
            document.head.appendChild(spinEl);
          }
        }
        return null;
      })()}
    </>
  );
};

export default EnquiryBadge;
