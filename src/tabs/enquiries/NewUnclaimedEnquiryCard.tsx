import React, { useState } from 'react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Text, Icon } from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import EnquiryBadge from './EnquiryBadge';
import { useClaimEnquiry } from '../../utils/claimEnquiry';
import InlineWorkbench from '../instructions/InlineWorkbench';

interface Props {
  enquiry: Enquiry & { __sourceType?: 'new' | 'legacy' };
  onSelect: (enquiry: Enquiry) => void;
  onRate: (id: string) => void;
  onAreaChange?: (enquiryId: string, newArea: string) => void | Promise<void>;
  isLast: boolean;
  userEmail?: string;
  onClaimSuccess?: () => void;
  onOptimisticClaim?: (enquiryId: string, claimerEmail: string) => void;
  promotionStatus?: 'pitch' | 'instruction' | null;
  /**
   * Number of documents uploaded for this enquiry (if available)
   */
  documentCount?: number;
  inlineWorkbenchItem?: any;
  teamData?: any[] | null;
  workbenchHandlers?: {
    onDocumentPreview?: (doc: any) => void;
    onOpenRiskAssessment?: (instruction: any) => void;
    onOpenMatter?: (instruction: any) => void;
    onTriggerEID?: (instructionRef: string) => void | Promise<void>;
    onOpenIdReview?: (instructionRef: string) => void;
    onRefreshData?: (instructionRef?: string) => void | Promise<void>;
  };
}

/**
 * Dedicated card for NEW source unclaimed enquiries (team@helix-law.com)
 * - Only Claim is enabled; Delegate/Triage/Redirect/Can't Assist are disabled with no handlers.
 */

// --- Notes formatting & clamp ---
function normalizeNotes(raw: string): string {
  let s = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

interface EnquiryNotesClampProps { notes: string; isDark: boolean; forceExpand?: boolean }
const EnquiryNotesClamp: React.FC<EnquiryNotesClampProps> = ({ notes, isDark, forceExpand }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [showChevron, setShowChevron] = React.useState(false);
  const clampRef = React.useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => { if (forceExpand) setExpanded(true); }, [forceExpand]);
  React.useEffect(() => {
    if (!expanded && clampRef.current) {
      const el = clampRef.current;
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      setShowChevron(overflowing);
      setIsOverflowing(overflowing);
    } else if (expanded) {
      setShowChevron(true);
      setIsOverflowing(false);
    }
  }, [notes, expanded]);

  return (
    <div style={{ 
      fontSize: 11, 
      lineHeight: 1.4, 
      color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
      transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease'
    }}>
      {expanded ? (
        <div 
          aria-live="polite"
          style={{ 
            whiteSpace: 'pre-line',
            wordWrap: 'break-word',
            maxHeight: '500px',
            opacity: 1,
            transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease'
          }}
        >
          {normalizeNotes(notes)}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            ref={clampRef}
            style={{
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'pre-line', maxHeight: 57,
              transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
              opacity: 1
            }}
            aria-hidden={expanded}
          >
            {normalizeNotes(notes)}
          </div>
          {isOverflowing && (
            <div
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, pointerEvents: 'none',
                background: isDark
                  ? 'linear-gradient(to bottom, rgba(15,23,42,0), rgba(15,23,42,0.9))' // Better match to card background
                  : 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.9))' }}
            />
          )}
        </div>
      )}
      {showChevron && (
        <button
          type="button"
          style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', color: '#7a869a', background: 'transparent', border: 'none', padding: 2 }}
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse notes' : 'Expand notes'}
        >
          <Icon iconName="ChevronDown" styles={{ root: { transition: 'transform 0.2s', transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)', fontSize: 14 } }} />
        </button>
      )}
    </div>
  );
};

// --- Card ---
const getAreaColour = (area?: string) => {
  const a = area?.toLowerCase() || '';
  if (a.includes('commercial')) return colours.blue;
  if (a.includes('construction')) return colours.orange;
  if (a.includes('property')) return colours.green;
  if (a.includes('employment')) return colours.yellow;
  if (a.includes('other') || a.includes('unsure')) return colours.greyText;
  return colours.greyText;
};

const NewUnclaimedEnquiryCard: React.FC<Props> = ({ enquiry, onSelect, onAreaChange, userEmail, onClaimSuccess, onOptimisticClaim, promotionStatus, documentCount = 0, inlineWorkbenchItem, teamData, workbenchHandlers }) => {
  const { isDarkMode } = useTheme();
  const [selected, setSelected] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const { claimEnquiry, isLoading, error: _error } = useClaimEnquiry();
  void _error; // Error handling via toast, kept for debugging
  const [justClaimed, setJustClaimed] = useState(false);

  const areaColor = getAreaColour(enquiry.Area_of_Work);
  const hasInlineWorkbench = Boolean(inlineWorkbenchItem);

  // Enhanced styling to match instruction cards - code-like dark mode with clean design
  const bgGradientLight = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
  
  const selectedBg = isDarkMode 
    ? `#1e293b` // Solid dark blue-grey for code-like feel
    : `linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)`;
  
  const selectedBorder = isDarkMode
    ? `1px solid ${areaColor}`
    : `1px solid ${areaColor}`;
    
  const selectedShadow = isDarkMode
    ? `0 1px 3px rgba(0,0,0,0.8)` // Minimal shadow in dark mode
    : `0 8px 32px ${areaColor}25, 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)`;

  const container = mergeStyles({
    position: 'relative',
    margin: '6px 0', // Reduced margin to match instruction cards
    borderRadius: 8,
    padding: '12px',
    background: selected 
      ? selectedBg
      : (isDarkMode ? '#0f172a' : bgGradientLight), // Solid dark background to match instruction cards
    opacity: promotionStatus ? 0.6 : 1,
    // Responsive padding
    '@media (max-width: 768px)': {
      padding: '10px 12px',
    },
    '@media (max-width: 480px)': {
      padding: '8px 12px',
      borderRadius: 6,
    },
    border: selected || showActions 
      ? selectedBorder
      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)'}`,
    borderLeft: `2px solid ${selected ? areaColor : (isDarkMode ? areaColor : `${areaColor}60`)}`, // Override just the left side
    boxShadow: selected
      ? selectedShadow
      : (isDarkMode ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.07)'),
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    marginBottom: 4,
    overflow: 'hidden',
    transform: selected ? 'translateY(-2px)' : 'translateY(0)',
    selectors: {
      ':hover': {
        transform: selected ? 'translateY(-3px)' : 'translateY(-1px)', 
        boxShadow: selected 
          ? (isDarkMode ? `0 2px 8px rgba(0,0,0,0.9)` : `0 12px 40px ${areaColor}50, 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)`)
          : (isDarkMode ? '0 1px 3px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)'),
        border: `1px solid ${areaColor}`, // Change the main border to area color on hover
        borderLeft: `2px solid ${areaColor}`, // Keep left border consistent
      },
      ':active': { transform: selected ? 'translateY(-1px)' : 'translateY(0)' },
      ':focus-within': { 
        outline: `2px solid ${areaColor}40`, // Thinner outline
        outlineOffset: '2px',
        borderColor: areaColor 
      },
    },
  });

  const handleSelect = () => {
    setSelected(true);
    setShowActions(true);
    onSelect(enquiry);
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userEmail || !enquiry.ID) {
      console.error('Missing userEmail or enquiry ID for claim');
      return;
    }
    
    // Determine data source from __sourceType property
    const dataSource = enquiry.__sourceType || 'legacy';
    
    // Optimistic update - immediately show as claimed in UI
    setJustClaimed(true);
    setShowActions(true);
    if (onOptimisticClaim) {
      onOptimisticClaim(enquiry.ID, userEmail);
    }
    
    try {
      const result = await claimEnquiry(enquiry.ID, userEmail, dataSource);
      if (result.success) {
        // Background refresh to sync with server (non-blocking)
        if (onClaimSuccess) {
          Promise.resolve(onClaimSuccess()).catch(err => console.warn('Background refresh failed:', err));
        }
      } else {
        console.error('[NewUnclaimedEnquiryCard] Failed to claim enquiry:', result.error);
        // Revert optimistic update
        setJustClaimed(false);
        if (onClaimSuccess) {
          onClaimSuccess();
        }
      }
    } catch (err) {
      console.error('[NewUnclaimedEnquiryCard] Error claiming enquiry:', err);
      // Revert optimistic update
      setJustClaimed(false);
      if (onClaimSuccess) {
        onClaimSuccess();
      }
    }
  };

  return (
    <div
      className={container}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { if (!selected) setShowActions(false); }}
      onClick={handleSelect}
      role="article"
      tabIndex={0}
      aria-label="Unclaimed enquiry (new data)"
      aria-selected={selected}
    >
      {/* Left accent */}
      <span style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 2,
        background: areaColor,
        opacity: .95,
        pointerEvents: 'none',
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
      }} />

      {/* Badge - positioned with consistent margin */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: 'fit-content'
      }}>
        {/* Document count badge - only show if documents exist */}
        {documentCount > 0 && (
          <div
            title={`${documentCount} document${documentCount === 1 ? '' : 's'} attached`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 6,
              background: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(135, 243, 243, 0.15)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(135, 243, 243, 0.35)'}`,
              fontSize: 10,
              fontWeight: 600,
              color: isDarkMode ? colours.accent : '#0d7377',
            }}
          >
            <Icon iconName="Documentation" styles={{ root: { fontSize: 11 } }} />
            <span>{documentCount}</span>
          </div>
        )}
        <EnquiryBadge enquiry={enquiry} isClaimed={false} showPulse={true} onAreaChange={onAreaChange} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: areaColor,
            boxShadow: `0 0 0 3px ${areaColor}33`,
            animation: 'pulseEnquiry 1.8s ease-in-out infinite',
            display: 'inline-block'
          }}
        />
        <Text variant="medium" styles={{ root: { fontWeight: 600, color: isDarkMode ? '#fff' : '#0d2538', lineHeight: 1.2 } }}>
          {(enquiry.First_Name || '') + ' ' + (enquiry.Last_Name || '')}
        </Text>
        {enquiry.ID && (
          <span style={{ fontSize: 11, color: isDarkMode ? 'rgba(255,255,255,0.55)' : '#8aa0b3', fontWeight: 500, letterSpacing: 0.4 }}>
            ID {enquiry.ID}
          </span>
        )}
        {promotionStatus && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: promotionStatus === 'instruction' ? (isDarkMode ? 'rgba(76, 175, 80, 0.15)' : 'rgba(232, 245, 232, 0.6)') : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(227, 242, 253, 0.6)'),
            color: promotionStatus === 'instruction' ? (isDarkMode ? 'rgba(76, 175, 80, 0.8)' : 'rgba(46, 125, 50, 0.7)') : colours.highlight,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            opacity: 0.85
          }}>
            {promotionStatus === 'instruction' ? 'Instructed' : 'Pitched'}
          </span>
        )}
      </div>

      {/* Meta */}
      <div style={{
        display: 'flex',
        gap: 12,
        fontSize: 11,
        color: isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
        fontWeight: 500,
        marginTop: 6,
      }}>
        {enquiry.Value && <span style={{ fontWeight: 600 }}>{enquiry.Value}</span>}
      </div>

      {/* Notes */}
      {enquiry.Initial_first_call_notes && (
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <EnquiryNotesClamp notes={enquiry.Initial_first_call_notes} isDark={isDarkMode} forceExpand={selected} />
        </div>
      )}

      {hasInlineWorkbench && selected && (
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        }}>
          <InlineWorkbench
            item={inlineWorkbenchItem}
            isDarkMode={isDarkMode}
            enableContextStageChips={true}
            onDocumentPreview={workbenchHandlers?.onDocumentPreview}
            onTriggerEID={workbenchHandlers?.onTriggerEID}
            onOpenIdReview={workbenchHandlers?.onOpenIdReview}
            onOpenMatter={workbenchHandlers?.onOpenMatter}
            onOpenRiskAssessment={workbenchHandlers?.onOpenRiskAssessment}
            onRefreshData={workbenchHandlers?.onRefreshData ? () => workbenchHandlers.onRefreshData!(inlineWorkbenchItem?.instruction?.InstructionRef || inlineWorkbenchItem?.instruction?.instructionRef) : undefined}
            onClose={() => setSelected(false)}
            teamData={teamData}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: 'flex', 
        flexDirection: 'column', 
        marginTop: 8,
        transition: 'max-height 0.35s cubic-bezier(.4,0,.2,1), padding 0.35s cubic-bezier(.4,0,.2,1)',
        maxHeight: showActions || selected ? 70 : 0,
        paddingTop: showActions || selected ? 4 : 0,
        paddingBottom: showActions || selected ? 8 : 0,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(() => {
            const buttons = [
              { key: 'claim', label: 'Claim', colourType: 'primary', disabled: false },
              { key: 'delegate', label: 'Delegate', colourType: 'blue', disabled: true },
              { key: 'triage', label: 'Triage', colourType: 'blue', disabled: true },
              { key: 'redirect', label: 'Redirect', colourType: 'yellow', disabled: true },
              { key: 'cant', label: "Can't Assist", colourType: 'red', disabled: true },
            ] as const;
            return buttons.map((btn, idx) => {
              const delay = (showActions || selected) ? 120 + idx * 70 : (buttons.length - 1 - idx) * 65;
              const baseColour = btn.key === 'claim' ? colours.blue : btn.colourType === 'yellow' ? '#FFD600' : btn.colourType === 'red' ? colours.cta : colours.blue;
              const isClaim = btn.key === 'claim';
              return (
                <button
                  key={btn.key}
                  onClick={btn.disabled ? undefined : (btn.key === 'claim' ? (justClaimed ? undefined : handleClaim) : (e => { e.stopPropagation(); handleSelect(); }))}
                  disabled={btn.disabled || (btn.key === 'claim' && (isLoading || justClaimed))}
                  className={mergeStyles({
                    background: isClaim && (selected || justClaimed) ? baseColour : 'transparent',
                    color: btn.disabled || (btn.key === 'claim' && (isLoading || justClaimed)) ? '#9aa4b1' : (isClaim ? ((selected || justClaimed) ? '#fff' : baseColour) : colours.greyText),
                    border: `1.5px solid ${isClaim ? baseColour : 'transparent'}`,
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: btn.disabled || (btn.key === 'claim' && (isLoading || justClaimed)) ? 'not-allowed' : 'pointer',
                    opacity: showActions || selected ? 1 : 0,
                    transform: showActions || selected ? 'translateY(0) scale(1)' : 'translateY(6px) scale(.96)',
                    transition: 'opacity .4s cubic-bezier(.4,0,.2,1), transform .4s cubic-bezier(.4,0,.2,1), background .25s, color .25s, border .25s, border-radius .35s cubic-bezier(.4,0,.2,1)',
                    transitionDelay: `${delay}ms`,
                    selectors: {
                      ':hover': !btn.disabled && btn.key !== 'claim' ? { 
                        background: '#f4f6f8', 
                        color: colours.blue, 
                        borderRadius: 6 
                      } : btn.key === 'claim' && !btn.disabled && !justClaimed ? {
                        background: colours.blue,
                        color: '#fff',
                        borderRadius: 6
                      } : {},
                      ':active': !btn.disabled ? { 
                        transform: 'scale(0.95)',
                        borderRadius: 6 
                      } : {},
                    },
                  })}
                >{btn.key === 'claim' ? (isLoading ? 'Claiming...' : (justClaimed ? 'Claimed' : 'Claim')) : btn.label}</button>
              );
            });
          })()}
        </div>
        {justClaimed && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              color: isDarkMode ? '#4CAF50' : '#107C10',
              fontSize: 12,
              fontWeight: 600
            }}
          >
            <Icon iconName="CheckMark" styles={{ root: { fontSize: 14 } }} />
            <span>Claimed. Moving to Claimed list…</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewUnclaimedEnquiryCard;
