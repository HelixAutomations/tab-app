import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Enquiry } from '../../app/functionality/types';
import { FaPhone, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

// ── Types ─────────────────────────────────────────────────────────────────

interface DubberRecording {
  recording_id: string;
  from_party: string | null;
  from_label: string | null;
  to_party: string | null;
  to_label: string | null;
  call_type: string | null;
  duration_seconds: number | null;
  start_time_utc: string | null;
  document_sentiment_score: number | null;
  ai_document_sentiment: number | null;
  channel: string | null;
  status: string | null;
  matched_team_initials: string | null;
  matched_team_email: string | null;
  match_strategy: string | null;
  document_emotion_json: string | null;
}

interface TranscriptSentence {
  sentence_index: number;
  speaker: string;
  content: string;
  sentiment: number | null;
}

interface TranscriptData {
  sentences: TranscriptSentence[];
  summaries: Array<{ summary_source: string; summary_type: string; summary_text: string }>;
}

interface EnquiryCallsProps {
  enquiry: Enquiry;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function sentimentLabel(score: number | null): { text: string; color: string } {
  if (score === null || score === undefined) return { text: '—', color: colours.subtleGrey };
  if (score >= 0.6) return { text: 'Positive', color: colours.green };
  if (score >= 0.3) return { text: 'Neutral', color: colours.blue };
  return { text: 'Negative', color: colours.cta };
}

function sentenceColor(sentiment: number | null): string {
  if (sentiment === null || sentiment === undefined) return 'transparent';
  if (sentiment >= 0.6) return 'rgba(32, 178, 108, 0.12)';
  if (sentiment < 0.3) return 'rgba(214, 85, 65, 0.12)';
  return 'transparent';
}

function parseEmotions(json: string | null): Array<{ label: string; value: number }> {
  if (!json) return [];
  try {
    const obj = JSON.parse(json);
    return Object.entries(obj)
      .filter(([, v]) => typeof v === 'number')
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 4)
      .map(([label, value]) => ({ label, value: value as number }));
  } catch {
    return [];
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────────────────

const EnquiryCalls: React.FC<EnquiryCallsProps> = ({ enquiry }) => {
  const { isDarkMode } = useTheme();
  const [recordings, setRecordings] = useState<DubberRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptData>>({});
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);

  // Derive search criteria from enquiry
  const searchPhone = useMemo(() => {
    return (enquiry.Phone_Number || enquiry.Secondary_Phone || '').replace(/\s/g, '').trim();
  }, [enquiry.Phone_Number, enquiry.Secondary_Phone]);

  const searchName = useMemo(() => {
    const first = (enquiry.First_Name || '').trim();
    const last = (enquiry.Last_Name || '').trim();
    return [first, last].filter(Boolean).join(' ');
  }, [enquiry.First_Name, enquiry.Last_Name]);

  // Fetch recordings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Search by phone number and/or name
        const body: Record<string, string | number> = {};
        if (searchPhone) body.phoneNumber = searchPhone;
        else if (searchName) body.name = searchName;
        else {
          // No search criteria — show nothing
          setRecordings([]);
          setLoading(false);
          return;
        }
        body.maxResults = 50;

        const resp = await fetch('/api/dubberCalls/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setRecordings(data.recordings || []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load calls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchPhone, searchName]);

  // Expand/collapse transcript
  const toggleTranscript = useCallback(async (recordingId: string) => {
    if (expandedId === recordingId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(recordingId);

    // Already fetched
    if (transcripts[recordingId]) return;

    setLoadingTranscript(recordingId);
    try {
      const resp = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/transcript`);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();
      setTranscripts(prev => ({ ...prev, [recordingId]: data }));
    } catch {
      // Silent fail — show empty state
    } finally {
      setLoadingTranscript(null);
    }
  }, [expandedId, transcripts]);

  // ── Styles ──────────────────────────────────────────────────────────────

  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const cardBg = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const sectionBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const border = `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`;
  const headerAccent = isDarkMode ? colours.accent : colours.highlight;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <FaPhone style={{ color: headerAccent, fontSize: '16px' }} />
        <span style={{
          fontSize: '16px', fontWeight: 600, color: textPrimary, fontFamily: 'Raleway, sans-serif',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          Call History
        </span>
        {!loading && (
          <span style={{
            fontSize: '12px', color: textMuted, marginLeft: '4px',
          }}>
            {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: textMuted, fontSize: '13px',
          background: cardBg, border, borderRadius: 0,
        }}>
          Loading Dubber recordings…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 14px', background: 'rgba(214, 85, 65, 0.08)', border: `1px solid ${colours.cta}`,
          borderRadius: 0, color: isDarkMode ? '#f3f4f6' : '#061733', fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && recordings.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: textMuted, fontSize: '13px',
          background: cardBg, border, borderRadius: 0,
        }}>
          No Dubber recordings found for this enquiry.
        </div>
      )}

      {/* Recording Cards */}
      {recordings.map((rec) => {
        const isExpanded = expandedId === rec.recording_id;
        const sentiment = sentimentLabel(rec.document_sentiment_score);
        const dir = (rec.call_type || '').toLowerCase();
        const dirArrow = dir === 'outbound' ? '→' : dir === 'inbound' ? '←' : '·';
        const from = rec.from_label || rec.from_party || '—';
        const to = rec.to_label || rec.to_party || '—';
        const emotions = parseEmotions(rec.document_emotion_json);
        const transcript = transcripts[rec.recording_id];
        const isLoadingTx = loadingTranscript === rec.recording_id;

        return (
          <div
            key={rec.recording_id}
            style={{
              background: cardBg,
              border,
              borderRadius: 0,
              overflow: 'hidden',
            }}
          >
            {/* Card Header — clickable */}
            <div
              onClick={() => toggleTranscript(rec.recording_id)}
              style={{
                padding: '12px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isDarkMode ? colours.dark.cardHover : colours.light.cardHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {/* Direction icon */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDarkMode ? 'rgba(13, 47, 96, 0.5)' : 'rgba(54, 144, 206, 0.1)',
                fontSize: '13px', fontWeight: 700,
                color: dir === 'outbound' ? colours.blue : dir === 'inbound' ? colours.green : textMuted,
              }}>
                {dirArrow}
              </div>

              {/* Main details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: textPrimary }}>{from}</span>
                  <span style={{ fontSize: '11px', color: textMuted }}>{dirArrow}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: textPrimary }}>{to}</span>
                </div>
                <div style={{ fontSize: '11px', color: textMuted, marginTop: '2px' }}>
                  {formatDate(rec.start_time_utc)}
                  {rec.matched_team_initials && (
                    <span style={{ marginLeft: '8px', color: colours.blue }}>
                      {rec.matched_team_initials}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration */}
              <span style={{
                fontSize: '12px', fontWeight: 600, color: textBody,
                fontFamily: 'monospace', whiteSpace: 'nowrap',
              }}>
                {formatDuration(rec.duration_seconds)}
              </span>

              {/* Sentiment pill */}
              <span style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: '999px',
                background: `${sentiment.color}22`, color: sentiment.color,
                letterSpacing: '0.3px', whiteSpace: 'nowrap',
              }}>
                {sentiment.text}
              </span>

              {/* Chevron */}
              {isExpanded
                ? <FaChevronUp style={{ color: textMuted, fontSize: '11px', flexShrink: 0 }} />
                : <FaChevronDown style={{ color: textMuted, fontSize: '11px', flexShrink: 0 }} />
              }
            </div>

            {/* Expanded detail panel */}
            {isExpanded && (
              <div style={{
                borderTop: border,
                padding: '14px',
                background: sectionBg,
                display: 'flex', flexDirection: 'column', gap: '12px',
              }}>
                {/* Meta grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '8px',
                }}>
                  {[
                    { label: 'Direction', value: rec.call_type || '—' },
                    { label: 'Duration', value: formatDuration(rec.duration_seconds) },
                    { label: 'Channel', value: rec.channel || '—' },
                    { label: 'Team Member', value: rec.matched_team_initials || '—' },
                    { label: 'Match', value: rec.match_strategy || '—' },
                    { label: 'Sentiment', value: rec.document_sentiment_score !== null ? `${(rec.document_sentiment_score * 100).toFixed(0)}%` : '—' },
                  ].map(pair => (
                    <div key={pair.label}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted }}>
                        {pair.label}
                      </div>
                      <div style={{ fontSize: '13px', color: textPrimary, marginTop: '2px' }}>
                        {pair.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Emotion tags */}
                {emotions.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {emotions.map(e => (
                      <span key={e.label} style={{
                        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                        background: isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                        color: isDarkMode ? colours.accent : colours.blue,
                        textTransform: 'capitalize',
                      }}>
                        {e.label} {(e.value * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}

                {/* Transcript / Summary */}
                {isLoadingTx && (
                  <div style={{ fontSize: '12px', color: textMuted, padding: '8px 0' }}>
                    Loading transcript…
                  </div>
                )}

                {transcript && transcript.summaries?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: headerAccent, marginBottom: '6px', fontWeight: 700 }}>
                      Summary
                    </div>
                    {transcript.summaries.map((s, i) => (
                      <div key={i} style={{
                        fontSize: '13px', color: textBody, lineHeight: 1.5,
                        padding: '8px 10px', background: isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.6)',
                        borderRadius: 0, marginBottom: '4px',
                      }}>
                        {s.summary_text}
                      </div>
                    ))}
                  </div>
                )}

                {transcript && transcript.sentences?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: headerAccent, marginBottom: '6px', fontWeight: 700 }}>
                      Transcript ({transcript.sentences.length} sentences)
                    </div>
                    <div style={{
                      maxHeight: '300px', overflowY: 'auto',
                      display: 'flex', flexDirection: 'column', gap: '2px',
                    }}>
                      {transcript.sentences.map(s => (
                        <div key={s.sentence_index} style={{
                          display: 'flex', gap: '8px', padding: '4px 8px', fontSize: '12px',
                          lineHeight: 1.5, background: sentenceColor(s.sentiment), borderRadius: 0,
                        }}>
                          <span style={{
                            fontWeight: 700, fontSize: '10px', textTransform: 'uppercase',
                            color: colours.blue, minWidth: '60px', flexShrink: 0, paddingTop: '2px',
                          }}>
                            {s.speaker}
                          </span>
                          <span style={{ color: textBody }}>
                            {s.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {transcript && transcript.sentences?.length === 0 && (
                  <div style={{ fontSize: '12px', color: textMuted, fontStyle: 'italic' }}>
                    No transcript available for this recording.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EnquiryCalls;