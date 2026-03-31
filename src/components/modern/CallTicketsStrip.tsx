import React, { useState, useEffect, useCallback } from 'react';
import { FiPhone, FiRefreshCw, FiCheck, FiLink, FiX } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';

interface CallRecord {
  recording_id: string;
  from_party: string | null;
  from_label: string | null;
  to_party: string | null;
  to_label: string | null;
  call_type: string | null;
  duration_seconds: number | null;
  start_time_utc: string;
  document_sentiment_score: number | null;
  ai_document_sentiment: string | null;
  matched_team_initials: string | null;
  is_internal?: boolean;
  resolved_name?: string;
  resolved_source?: string;
  resolved_ref?: string | null;
  resolved_area?: string | null;
}

interface CallTicketsStripProps {
  isDarkMode: boolean;
  userInitials: string;
}

export default function CallTicketsStrip({ isDarkMode, userInitials }: CallTicketsStripProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/dubberCalls?teamInitials=${encodeURIComponent(userInitials)}&limit=10`);
      if (res?.ok) {
        const data = await res.json();
        setCalls(data.recordings || []);
      }
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, [userInitials]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  /** Confirm a resolved name — writes to DB, then updates local state. */
  const confirmResolvedName = useCallback(async (call: CallRecord) => {
    if (!call.resolved_name) return;
    const isInbound = call.call_type === 'inbound';
    const field = isInbound ? 'from_label' : 'to_label';
    setConfirming(call.recording_id);
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(call.recording_id)}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: call.resolved_name, field }),
      });
      if (res?.ok) {
        // Update local state: move resolved_name into the label field, clear resolved flags
        setCalls(prev => prev.map(c => {
          if (c.recording_id !== call.recording_id) return c;
          return {
            ...c,
            [field]: call.resolved_name,
            resolved_name: undefined,
            resolved_source: undefined,
          };
        }));
      }
    } catch { /* silent */ }
    finally { setConfirming(null); }
  }, []);

  // Only hide when loaded and truly empty
  if (!isLoading && calls.length === 0) return null;

  const accent = isDarkMode ? colours.accent : colours.highlight;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  // Section card tokens — match Dashboard exactly
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const cardShadow = isDarkMode ? 'none' : 'inset 0 0 0 1px rgba(13,47,96,0.06), 0 1px 4px rgba(13,47,96,0.04)';
  const cardHoverBorder = isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(13,47,96,0.18)';
  const cardHoverShadow = isDarkMode
    ? '0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(135,243,243,0.08)'
    : '0 4px 16px rgba(13,47,96,0.10), inset 0 0 0 1px rgba(13,47,96,0.10)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)';

  // Ticket-level tokens (inner cards)
  const ticketBg = isDarkMode ? 'rgba(6, 23, 51, 0.6)' : 'rgba(13, 47, 96, 0.03)';
  const ticketBorder = isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(13, 47, 96, 0.08)';

  // Skeleton tokens
  const skeletonStrong = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(54,144,206,0.06)';
  const skeletonSoft = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.04)';

  return (
    <div>
      {/* Section header — matches Billing / Conversion / Pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0 3px' }}>
        <FiPhone size={10} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: muted, letterSpacing: '0.2px' }}>My calls</span>
        {!isLoading && <span style={{ fontSize: 8, color: muted, opacity: 0.5 }}>{calls.length}</span>}
      </div>

      {/* Card wrapper — same contract as other Dashboard sections */}
      <div
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          boxShadow: cardShadow,
          animation: 'opsDashFadeIn 0.35s ease both',
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = cardHoverBorder;
          e.currentTarget.style.boxShadow = cardHoverShadow;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = cardBorder;
          e.currentTarget.style.boxShadow = cardShadow;
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {isLoading ? (
          /* ── Skeleton ── */
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FiRefreshCw size={11} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: text }}>Loading calls</div>
                <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>Fetching your recent recordings.</div>
              </div>
            </div>
            <div style={{ height: 1, background: rowBorder }} />
            <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{
                  width: 120, height: 52, flexShrink: 0,
                  background: skeletonStrong,
                  borderTop: `2px solid ${skeletonSoft}`,
                  animation: 'opsDashPulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.12}s`,
                }} />
              ))}
            </div>
          </div>
        ) : (
          /* ── Populated tickets ── */
          <div style={{
            display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 10px',
            scrollbarWidth: 'none',
          }}>
            {calls.map(call => {
              const isInbound = call.call_type === 'inbound';
              const label = isInbound ? call.from_label : call.to_label;
              const rawParty = isInbound ? call.from_party : call.to_party;
              const hasResolvedSuggestion = !!call.resolved_name;
              const party = call.resolved_name || label || rawParty || '—';
              const mins = call.duration_seconds != null ? Math.floor(call.duration_seconds / 60) : null;
              const secs = call.duration_seconds != null ? call.duration_seconds % 60 : null;
              const durationText = mins != null ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
              const sentimentScore = call.document_sentiment_score;
              const sentimentColour = sentimentScore != null
                ? (sentimentScore >= 0.6 ? colours.green : sentimentScore <= 0.4 ? colours.cta : colours.orange)
                : colours.subtleGrey;
              const callTime = call.start_time_utc ? new Date(call.start_time_utc) : null;
              const timeLabel = callTime
                ? callTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : '';
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const callDay = callTime ? new Date(callTime.getFullYear(), callTime.getMonth(), callTime.getDate()) : null;
              const diffDays = callDay ? Math.floor((today.getTime() - callDay.getTime()) / 86400000) : 0;
              const dayLabel = diffDays === 0 ? '' : diffDays === 1 ? 'Yest' : callTime?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) || '';
              const dirColour = isInbound ? colours.green : colours.blue;
              const isSelected = selectedCallId === call.recording_id;

              return (
                <div
                  key={call.recording_id}
                  onClick={() => setSelectedCallId(isSelected ? null : call.recording_id)}
                  style={{
                    flexShrink: 0,
                    width: 120,
                    background: isSelected ? (isDarkMode ? 'rgba(6, 23, 51, 0.95)' : 'rgba(13, 47, 96, 0.08)') : ticketBg,
                    border: `1px solid ${isSelected ? accent : ticketBorder}`,
                    borderTop: `2px solid ${isSelected ? accent : sentimentColour}`,
                    padding: '6px 8px 5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    transition: 'all 0.12s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderTopColor = accent;
                      e.currentTarget.style.background = isDarkMode ? 'rgba(6, 23, 51, 0.9)' : 'rgba(13, 47, 96, 0.06)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderTopColor = sentimentColour;
                      e.currentTarget.style.background = ticketBg;
                    }
                  }}
                >
                  {/* Direction + time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: dirColour, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      {isInbound ? '← IN' : '→ OUT'}
                    </span>
                    <span style={{ fontSize: 7, color: muted, fontVariantNumeric: 'tabular-nums' }}>
                      {dayLabel ? <span style={{ opacity: 0.6 }}>{dayLabel} </span> : null}{timeLabel}
                    </span>
                  </div>
                  {/* Party name */}
                  <div style={{
                    fontSize: 9, fontWeight: 600, color: hasResolvedSuggestion ? accent : text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    lineHeight: '12px',
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontStyle: hasResolvedSuggestion ? 'italic' : 'normal',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{party}</span>
                    {hasResolvedSuggestion && (
                      <span
                        title={`Confirm: ${call.resolved_name} (matched from ${call.resolved_source})`}
                        onClick={e => { e.stopPropagation(); confirmResolvedName(call); }}
                        style={{
                          flexShrink: 0,
                          width: 12, height: 12,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: confirming === call.recording_id ? accent : 'transparent',
                          border: `1px solid ${accent}`,
                          cursor: confirming === call.recording_id ? 'wait' : 'pointer',
                          opacity: confirming === call.recording_id ? 0.5 : 0.8,
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <FiCheck size={7} color={confirming === call.recording_id ? text : accent} />
                      </span>
                    )}
                  </div>
                  {/* Duration */}
                  <div style={{
                    fontSize: 8, color: muted,
                    fontFamily: "'Consolas', 'Courier New', monospace",
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {durationText}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* ── Detail panel: shown when a ticket is selected ── */}
        {selectedCallId && (() => {
          const call = calls.find(c => c.recording_id === selectedCallId);
          if (!call) return null;
          const isInbound = call.call_type === 'inbound';
          const label = isInbound ? call.from_label : call.to_label;
          const rawParty = isInbound ? call.from_party : call.to_party;
          const hasResolvedSuggestion = !label && !!call.resolved_name;
          const isConfirmed = !!label;
          const displayName = label || call.resolved_name || rawParty || '—';
          const mins = call.duration_seconds != null ? Math.floor(call.duration_seconds / 60) : null;
          const secs = call.duration_seconds != null ? call.duration_seconds % 60 : null;
          const durationText = mins != null ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
          const callTime = call.start_time_utc ? new Date(call.start_time_utc) : null;
          const timeStr = callTime ? callTime.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const dirColour = isInbound ? colours.green : colours.blue;
          const sourceLabel = call.resolved_source === 'enquiry' ? 'Core enquiries'
            : call.resolved_source === 'enquiry-v2' ? 'Enquiries v2'
            : call.resolved_source === 'instructions' ? 'Instructions'
            : null;

          return (
            <div style={{
              borderTop: `1px solid ${rowBorder}`,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              animation: 'opsDashFadeIn 0.15s ease both',
            }}>
              {/* Direction badge */}
              <span style={{
                fontSize: 7, fontWeight: 700, color: dirColour,
                letterSpacing: '0.3px', textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                {isInbound ? '← IN' : '→ OUT'}
              </span>

              {/* Time + duration */}
              <span style={{ fontSize: 8, color: muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {timeStr} · {durationText}
              </span>

              {/* Pipeline match info */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {hasResolvedSuggestion ? (
                  <>
                    <FiLink size={9} style={{ color: accent, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 600, color: accent, fontStyle: 'italic' }}>
                      {call.resolved_name}
                    </span>
                    {sourceLabel && (
                      <span style={{ fontSize: 7, color: muted, opacity: 0.6 }}>via {sourceLabel}</span>
                    )}
                    {call.resolved_ref && (
                      <span style={{
                        fontSize: 7, color: muted, opacity: 0.5,
                        fontFamily: "'Consolas', 'Courier New', monospace",
                      }}>
                        {call.resolved_ref}
                      </span>
                    )}
                    {call.resolved_area && (
                      <span style={{ fontSize: 7, color: muted, opacity: 0.5 }}>
                        · {call.resolved_area}
                      </span>
                    )}
                  </>
                ) : isConfirmed ? (
                  <>
                    <FiCheck size={9} style={{ color: colours.green, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 600, color: text }}>{displayName}</span>
                    <span style={{ fontSize: 7, color: colours.green, opacity: 0.7 }}>confirmed</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 9, color: muted }}>
                      {rawParty || '—'}
                    </span>
                    <span style={{ fontSize: 7, color: muted, opacity: 0.5, fontStyle: 'italic' }}>no pipeline match</span>
                  </>
                )}
              </div>

              {/* Confirm / solidify button */}
              {hasResolvedSuggestion && (
                <button
                  onClick={e => { e.stopPropagation(); confirmResolvedName(call); }}
                  disabled={confirming === call.recording_id}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                    letterSpacing: '0.3px',
                    color: confirming === call.recording_id ? muted : accent,
                    background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(13,47,96,0.05)',
                    border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.2)' : 'rgba(13,47,96,0.12)'}`,
                    cursor: confirming === call.recording_id ? 'wait' : 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <FiCheck size={8} />
                  {confirming === call.recording_id ? 'Saving…' : 'Confirm'}
                </button>
              )}

              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); setSelectedCallId(null); }}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: muted,
                  opacity: 0.5,
                  padding: 2,
                  display: 'inline-flex',
                }}
              >
                <FiX size={10} />
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
