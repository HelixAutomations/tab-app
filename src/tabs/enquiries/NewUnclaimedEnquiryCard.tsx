import React, { useState } from 'react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Text, Icon } from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { parseISO, isToday, isYesterday, isThisWeek, format } from 'date-fns';

interface Props {
  enquiry: Enquiry & { __sourceType?: 'new' | 'legacy' };
  onSelect: (enquiry: Enquiry) => void;
  onRate: (id: string) => void;
  isLast: boolean;
}

/**
 * Dedicated card for NEW source unclaimed enquiries (team@helix-law.com) to allow independent styling.
 */
// Clamp notes to 2 lines with expand/collapse
// --- Notes formatting & normalization helpers ---
function normalizeNotes(raw: string): string {
  // Convert escaped newlines ("\n") into real newlines, then unify CRLF -> LF
  let s = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  // Collapse 3+ blank lines to 2
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// Live breakdown: Y, M, W, D, H, M, S (always show S if today)
export function formatLiveBreakdown(from: Date, now: Date = new Date(), alwaysShowSeconds = false): string {
  let diff = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const S = diff % 60; diff = Math.floor(diff / 60);
  const M = diff % 60; diff = Math.floor(diff / 60);
  const H = diff % 24; diff = Math.floor(diff / 24);
  const D = diff % 7; diff = Math.floor(diff / 7);
  const W = diff % 4; diff = Math.floor(diff / 4);
  const Mo = diff % 12; diff = Math.floor(diff / 12);
  const Y = diff;
  const parts = [];
  if (Y) parts.push(Y + 'Y');
  if (Mo) parts.push(Mo + 'M');
  if (W) parts.push(W + 'W');
  if (D) parts.push(D + 'D');
  if (H) parts.push(H + 'H');
  if (M) parts.push(M + 'M');
  if (alwaysShowSeconds || parts.length === 0) parts.push(S + 'S');
  return parts.join(' ');
}

/**
 * Live ticking badge showing multi-unit age (Y M W D H M S).
 * Uses its own 1s interval; future optimisation could share a global timer.
 */
function LiveEnquiryAgeBadge({ enquiry }: { enquiry: Enquiry | any }) {
  // Hooks must be called unconditionally; compute time source after establishing interval state.
  const [now, setNow] = React.useState<Date>(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rawTs: string | undefined = (enquiry as any).datetime || enquiry.Date_Created || (enquiry as any).Touchpoint_Date;
  if (!rawTs) return null; // early return before rendering any DOM
  let dateObj: Date | null = null;
  try {
    dateObj = parseISO(rawTs);
    if (isNaN(dateObj.getTime())) dateObj = new Date(rawTs);
  } catch {
    try { dateObj = new Date(rawTs); } catch { dateObj = null; }
  }
  if (!dateObj || isNaN(dateObj.getTime())) return null;

  const liveStr = formatLiveBreakdown(dateObj, now, isToday(dateObj));
  return (
    <span
      style={{
        fontSize: 10,
        color: '#b0b8c9',
        fontWeight: 600,
        marginLeft: 8,
        letterSpacing: 1.2,
        userSelect: 'all',
        fontFamily: 'Consolas, Monaco, monospace',
        background: 'rgba(180,200,255,0.10)',
        borderRadius: 6,
        padding: '1px 6px',
        display: 'inline-block',
        maxWidth: 90,
        overflowWrap: 'break-word',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        verticalAlign: 'middle',
      }}
      title={format(dateObj, 'yyyy-MM-dd HH:mm')}
    >{liveStr}</span>
  );
}

function formatEnquiryNotes(notes: string): React.ReactNode[] {
  const cleaned = normalizeNotes(notes);
  let blocks = cleaned.split(/\n{2,}/); // split on blank line groups
  // Remove exact consecutive duplicates (sometimes data contains duplicated body)
  const dedup: string[] = [];
  for (const b of blocks) {
    if (dedup.length === 0 || dedup[dedup.length - 1] !== b) dedup.push(b);
  }
  blocks = dedup;
  const nodes: React.ReactNode[] = [];
  blocks.forEach((block, idx) => {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    // Detect bullet OR numbered list if majority of lines start with a marker
    const bulletPattern = /^(?:[•\-*]|\u2022)\s?/; // matches • or - *
    const numberedPattern = /^\d+\.|^\d+\)/; // 1. or 1)
    const bulletLines = lines.filter(l => bulletPattern.test(l));
    const numberedLines = lines.filter(l => numberedPattern.test(l));
    const asList = (bulletLines.length && bulletLines.length >= lines.length / 2) || (numberedLines.length && numberedLines.length >= lines.length / 2);
    if (asList) {
      const items = lines.map((l, li) => {
        const clean = l.replace(bulletPattern, '').replace(numberedPattern, '').trim();
        return <li key={`b-${idx}-${li}`}>{clean}</li>;
      });
      nodes.push(
        <ul key={`ul-${idx}`} style={{ margin: '0 0 8px 18px', padding: 0, listStyle: bulletLines.length ? 'disc' : 'decimal' }}>
          {items}
        </ul>
      );
    } else {
      const text = lines.join('\n');
      nodes.push(
        <p key={`p-${idx}`} style={{ margin: '0 0 8px 0', whiteSpace: 'pre-line' }}>
          {text}
        </p>
      );
    }
  });
  return nodes;
}

interface EnquiryNotesClampProps { notes: string; isDark: boolean; forceExpand?: boolean; }
const EnquiryNotesClamp = ({ notes, isDark, forceExpand }: EnquiryNotesClampProps) => {
  const [expanded, setExpanded] = React.useState(false);
  const [showChevron, setShowChevron] = React.useState(false);
  const clampRef = React.useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  // Auto-expand when parent selection occurs
  React.useEffect(() => {
    if (forceExpand) setExpanded(true);
  }, [forceExpand]);

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
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
        marginTop: 2,
        wordBreak: 'break-word',
        position: 'relative',
        boxSizing: 'border-box',
        marginLeft: 0,
        textAlign: 'justify',
        width: '100%',
      }}
    >
      {expanded ? (
        <div
          ref={clampRef}
          style={{ transition: 'max-height 0.32s cubic-bezier(.4,0,.2,1)', maxHeight: 1000, overflow: 'visible' }}
          aria-live="polite"
        >
          {formatEnquiryNotes(notes)}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            ref={clampRef}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'pre-line',
              transition: 'max-height 0.32s cubic-bezier(.4,0,.2,1)',
              maxHeight: 57,
            }}
            aria-hidden={expanded}
          >
            {normalizeNotes(notes)}
          </div>
          {isOverflowing && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 18,
                background: isDark
                  ? 'linear-gradient(to bottom, rgba(31,39,50,0), rgba(31,39,50,0.9))'
                  : 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.95))',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}
      {showChevron && (
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            color: '#7a869a',
            fontSize: 15,
            marginLeft: 2,
            marginTop: 2,
            userSelect: 'none',
            transition: 'color 0.2s',
            background: 'transparent',
            border: 'none',
            padding: 2,
          }}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse notes' : 'Expand notes'}
        >
          <Icon iconName="ChevronDown" styles={{ root: { transition: 'transform 0.32s cubic-bezier(.4,0,.2,1)', transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)', fontSize: 15, marginLeft: 0, marginRight: 0, color: '#7a869a' } }} />
        </button>
      )}
    </div>
  );
};

// --- Singleton hover coordination ---
type HoverListener = (id: string | null) => void;
const hoverListeners: HoverListener[] = [];
let currentHoveredId: string | null = null;
function subscribeHover(listener: HoverListener) {
  hoverListeners.push(listener);
  return () => {
    const idx = hoverListeners.indexOf(listener);
    if (idx !== -1) hoverListeners.splice(idx, 1);
  };
}
function notifyHover(id: string | null) {
  currentHoveredId = id;
  hoverListeners.forEach(l => l(id));
}

const NewUnclaimedEnquiryCard: React.FC<Props> = ({ enquiry, onSelect, onRate, isLast }) => {
  const { isDarkMode } = useTheme();
  const isDark = isDarkMode;
  const [selected, setSelected] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [hasAnimatedActions, setHasAnimatedActions] = useState(false);
  // For hover coordination
  const cardId = enquiry.ID || Math.random().toString(36).slice(2);

  React.useEffect(() => {
    // Subscribe to hover events
    const unsub = subscribeHover((id) => {
      if (id !== cardId) {
        setShowActions(false);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const container = mergeStyles({
    position: 'relative',
    borderRadius: 12,
    padding: '14px 18px 14px 22px',
    background: isDark ? '#1f2732' : '#ffffff',
    border: `1px solid ${selected ? colours.blue : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
    boxShadow: isDark
      ? '0 4px 16px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)'
      : '0 4px 14px rgba(33,56,82,0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'border-color .2s, transform .15s',
    marginBottom: isLast ? 0 : 4,
    // No left border
    selectors: {
      ':hover': { transform: 'translateY(-2px)', borderColor: selected ? colours.blue : colours.highlight },
      ':active': { transform: 'translateY(-1px)' },
    },
  });
  // Area color logic (copy from EnquiryLineItem)
  const getAreaColor = (area: string): string => {
    switch (area?.toLowerCase()) {
      case 'commercial':
        return colours.blue;
      case 'construction':
        return colours.orange;
      case 'property':
        return colours.green;
      case 'employment':
        return colours.yellow;
      default:
        return colours.cta;
    }
  };

  const areaColor = getAreaColor(enquiry.Area_of_Work || '');
  const pulse = mergeStyles({
    width: 9,
    height: 9,
    minWidth: 9,
    minHeight: 9,
    borderRadius: '50%',
    background: areaColor,
    boxShadow: `0 0 0 6px ${areaColor}44`, // 44 = ~27% opacity
    animation: 'pulseNewUnclaimed 1.8s ease-in-out infinite',
    display: 'inline-block',
    verticalAlign: 'middle',
    marginLeft: 4,
    flexShrink: 0,
  });

  if (typeof document !== 'undefined' && !document.getElementById('pulseNewUnclaimedStyles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'pulseNewUnclaimedStyles';
    styleEl.textContent = `@keyframes pulseNewUnclaimed {0%{transform:scale(.85);opacity:.55}50%{transform:scale(1.3);opacity:1}100%{transform:scale(.85);opacity:.55}}`;
    document.head.appendChild(styleEl);
  }

  const meta = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 11,
    color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
    fontWeight: 500,
    marginTop: 6,
    marginLeft: 2,
  });

  return (
    <div
      className={container}
      onMouseEnter={() => {
        notifyHover(cardId);
        if (!hasAnimatedActions) {
          setShowActions(true);
          setHasAnimatedActions(true);
        } else {
          setShowActions(true); // ensure visible on re-hover without re-animating
        }
      }}
      onMouseLeave={() => {
        // Only hide if not selected and not animating
        if (!hasAnimatedActions && !selected) {
          setShowActions(false);
        }
        // If mouse leaves, clear global hover if this card was hovered
        if (currentHoveredId === cardId) {
          notifyHover(null);
        }
      }}
      onClick={() => {
        setSelected(true);
        if (!hasAnimatedActions) {
          setShowActions(true);
          setHasAnimatedActions(true);
        }
        onSelect(enquiry);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelected(true);
          if (!hasAnimatedActions) {
            setShowActions(true);
            setHasAnimatedActions(true);
          }
          onSelect(enquiry);
        }
      }}
      role="article"
      tabIndex={0}
      aria-label="Unclaimed enquiry (new data)"
      aria-pressed={selected}
      style={{ position: 'relative' }}
    >
      {/* Top right badge: area, dot, and time since enquiry */}
      {enquiry.Area_of_Work && (
        <span
          style={{
            position: 'absolute',
            top: 18,
            right: 14,
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 10,
              padding: '2px 10px 2px 8px',
              borderRadius: 12,
              background: 'rgba(102,170,232,0.15)',
              color: areaColor,
              fontWeight: 600,
              letterSpacing: .3,
              textTransform: 'uppercase',
              boxShadow: '0 1px 4px 0 rgba(33,56,82,0.07)',
              position: 'relative',
            }}
          >
            {enquiry.Area_of_Work}
            <span className={pulse} aria-hidden="true" />
            <LiveEnquiryAgeBadge enquiry={enquiry} />
          </span>
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / span 2', marginTop: 8 }}>
        <Text variant="medium" styles={{ root: { fontWeight: 600, color: isDark ? '#fff' : '#0d2538', lineHeight: 1.2, marginRight: 16 } }}>
          {(enquiry.First_Name || '') + ' ' + (enquiry.Last_Name || '')}
        </Text>
      </div>
      <div className={meta}>
        {enquiry.Value && (
          <span style={{ fontWeight: 600 }}>
            {enquiry.Value}
          </span>
        )}
      </div>
      {enquiry.Initial_first_call_notes && (
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <EnquiryNotesClamp notes={enquiry.Initial_first_call_notes} isDark={isDark} forceExpand={selected} />
        </div>
      )}
  {/* ID is now integrated into the area of work badge above */}
// Clamp notes to 2 lines with expand/collapse
      {/* ID badge bottom right */}
      {enquiry.ID && (
        <span
          style={{
            position: 'absolute',
            right: 16,
            bottom: 12,
            zIndex: 2,
            fontSize: 11,
            color: '#b0b8c9',
            fontWeight: 600,
            letterSpacing: 1.2,
            userSelect: 'all',
            fontFamily: 'Consolas, Monaco, monospace',
            background: 'rgba(180,200,255,0.10)',
            borderRadius: 6,
            padding: '2px 10px',
            display: 'inline-block',
            maxWidth: 110,
            overflowWrap: 'break-word',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            verticalAlign: 'middle',
            boxShadow: '0 1px 4px 0 rgba(33,56,82,0.07)',
          }}
        >
          {enquiry.ID}
        </span>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 6,
          transition: 'max-height 0.35s cubic-bezier(.4,0,.2,1), padding 0.35s cubic-bezier(.4,0,.2,1)',
          maxHeight: showActions || selected ? 60 : 0,
          paddingTop: showActions || selected ? 4 : 0,
          paddingBottom: showActions || selected ? 8 : 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(() => {
            const buttons = [
              { key: 'claim', label: 'Claim', colourType: 'primary', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setSelected(true); onSelect(enquiry); } },
              { key: 'delegate', label: 'Delegate', colourType: 'blue', onClick: (e: React.MouseEvent) => { e.stopPropagation(); alert('Delegate action coming soon!'); } },
              { key: 'triage', label: 'Triage', colourType: 'blue', onClick: (e: React.MouseEvent) => { e.stopPropagation(); alert('Triage action coming soon!'); } },
              { key: 'redirect', label: 'Redirect', colourType: 'yellow', onClick: (e: React.MouseEvent) => { e.stopPropagation(); alert('Redirect action coming soon!'); } },
              { key: 'cant', label: "Can't Assist", colourType: 'red', onClick: (e: React.MouseEvent) => { e.stopPropagation(); alert("Can't Assist action coming soon!"); } },
            ];
            // Only show when this card is actively set to show (hover) OR selected.
            const visible = showActions || selected;
            const count = buttons.length;
            const CONTAINER_ANIMATION_DELAY = 120; // ms
            const BUTTON_CASCADE_DELAY = 70; // ms
            return buttons.map((btn, idx) => {
              const baseColour = btn.key === 'claim' ? colours.blue :
                btn.colourType === 'blue' ? colours.blue :
                btn.colourType === 'yellow' ? '#FFD600' :
                btn.colourType === 'red' ? colours.cta : colours.blue;
              const isClaim = btn.key === 'claim';
              // Always cascade after container delay
              const delay = visible
                ? (!hasAnimatedActions ? `${CONTAINER_ANIMATION_DELAY + idx * BUTTON_CASCADE_DELAY}ms` : `${idx * BUTTON_CASCADE_DELAY}ms`)
                : `${(count - 1 - idx) * 65}ms`;
              return (
                <button
                  key={btn.key}
                  onClick={btn.onClick}
                  className={mergeStyles({
                    background: isClaim && selected ? baseColour : 'transparent',
                    color: isClaim ? (selected ? '#fff' : baseColour) : colours.greyText,
                    border: `1.5px solid ${isClaim ? baseColour : 'transparent'}`,
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: 'none',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(.96)',
                    transition: 'opacity .4s cubic-bezier(.4,0,.2,1), transform .4s cubic-bezier(.4,0,.2,1), background .25s, color .25s, border .25s, border-radius .35s cubic-bezier(.4,0,.2,1)',
                    transitionDelay: delay,
                    backgroundColor: isClaim && !selected ? 'transparent' : undefined,
                    selectors: {
                      ':hover': isClaim ? { background: selected ? baseColour : '#e3f1fb', color: selected ? '#fff' : baseColour, borderRadius: 6 } : { background: '#f4f6f8', color: baseColour, borderRadius: 6 },
                      ':active': isClaim
                        ? { background: baseColour, color: '#fff', borderRadius: 6, transform: 'scale(0.95)' }
                        : { background: '#e3f1fb', color: baseColour, borderRadius: 6, transform: 'scale(0.95)' },
                    },
                  })}
                >
                  {btn.label}
                </button>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};

export default NewUnclaimedEnquiryCard;
