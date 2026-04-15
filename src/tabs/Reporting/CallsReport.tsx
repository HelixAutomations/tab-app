import React, { useMemo, useState } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import type { TeamData } from '../../app/functionality/types';
import type { DubberCallRecord } from './dataSources';
import ReportShell from './components/ReportShell';
import ReportingSectionCard from './components/ReportingSectionCard';
import { useReportRange } from './hooks/useReportRange';
import './CallsReport.css';

// ── Types ──────────────────────────────────────────────────────────────────

interface CallsReportProps {
  dubberCalls: DubberCallRecord[] | null;
  teamData: TeamData[] | null;
  isFetching?: boolean;
  lastRefreshTimestamp?: number;
  triggerRefresh?: () => void;
}

type DirectionFilter = 'all' | 'inbound' | 'outbound';
type TabFilter = 'external' | 'internal';
type TeamSortCol = 'initials' | 'total' | 'inbound' | 'outbound' | 'avgDuration' | 'matched';
type SortDir = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtDuration = (secs: number | null): string => {
  if (secs == null || secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const fmtDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const fmtTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const fmtDateTime = (iso: string): string => `${fmtDate(iso)} ${fmtTime(iso)}`;

const sentimentLabel = (score: number | null, text: string | null): { label: string; cls: string } => {
  if (text === 'positive' || (score != null && score > 0.1)) return { label: 'Positive', cls: 'positive' };
  if (text === 'negative' || (score != null && score < -0.1)) return { label: 'Negative', cls: 'negative' };
  return { label: 'Neutral', cls: 'neutral' };
};

const inferDirection = (r: DubberCallRecord): 'inbound' | 'outbound' => {
  // If team member is the from_party, it's outbound; otherwise inbound
  if (r.matched_team_initials) {
    const fromLabel = (r.from_label || '').toLowerCase();
    const teamEmail = (r.matched_team_email || '').toLowerCase();
    if (teamEmail && fromLabel.includes(teamEmail.split('@')[0])) return 'outbound';
  }
  // call_type heuristic
  const ct = (r.call_type || '').toLowerCase();
  if (ct.includes('outbound') || ct.includes('outgoing')) return 'outbound';
  return 'inbound';
};

// ── Component ──────────────────────────────────────────────────────────────

const CallsReport: React.FC<CallsReportProps> = ({
  dubberCalls,
  teamData,
  isFetching,
  lastRefreshTimestamp,
  triggerRefresh,
}) => {
  const { isDarkMode } = useTheme();
  const range = useReportRange({ defaultKey: 'month' });

  // Filters
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('all');
  const [tabFilter, setTabFilter] = useState<TabFilter>('external');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'transcript' | 'ai'>('transcript');
  const [teamSort, setTeamSort] = useState<{ col: TeamSortCol; dir: SortDir }>({ col: 'total', dir: 'desc' });

  // ── Date-filtered calls ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!dubberCalls?.length) return [];
    return dubberCalls.filter((c) => {
      const d = new Date(c.start_time_utc);
      if (range.range) {
        if (d < range.range.start || d > range.range.end) return false;
      }
      return true;
    });
  }, [dubberCalls, range.range]);

  const external = useMemo(() => filtered.filter((c) => !c.is_internal), [filtered]);
  const internal = useMemo(() => filtered.filter((c) => c.is_internal), [filtered]);

  // Direction + team filter (for external tab)
  const visibleExternal = useMemo(() => {
    let list = external;
    if (dirFilter !== 'all') list = list.filter((c) => inferDirection(c) === dirFilter);
    if (teamFilter !== 'all') list = list.filter((c) => c.matched_team_initials === teamFilter);
    return list;
  }, [external, dirFilter, teamFilter]);

  // ── Summary metrics ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCalls = filtered.length;
    const externalCount = external.length;
    const internalCount = internal.length;
    const totalDuration = filtered.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const matchedEnquiry = external.filter((c) => c.enquiry_ref).length;
    const positiveCount = filtered.filter((c) => {
      const s = sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment);
      return s.cls === 'positive';
    }).length;
    const negativeCount = filtered.filter((c) => {
      const s = sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment);
      return s.cls === 'negative';
    }).length;
    return { totalCalls, externalCount, internalCount, totalDuration, avgDuration, matchedEnquiry, positiveCount, negativeCount };
  }, [filtered, external, internal]);

  // ── Team breakdown ───────────────────────────────────────────────────
  const teamBreakdown = useMemo(() => {
    const map = new Map<string, { initials: string; name: string; total: number; inbound: number; outbound: number; totalDuration: number; matched: number }>();
    for (const c of filtered) {
      const init = c.matched_team_initials || 'Unknown';
      if (!map.has(init)) {
        const member = teamData?.find((t) => t.Initials === init);
        map.set(init, { initials: init, name: member?.['Full Name'] || init, total: 0, inbound: 0, outbound: 0, totalDuration: 0, matched: 0 });
      }
      const entry = map.get(init)!;
      entry.total++;
      if (inferDirection(c) === 'inbound') entry.inbound++;
      else entry.outbound++;
      entry.totalDuration += c.duration_seconds || 0;
      if (c.enquiry_ref) entry.matched++;
    }
    const arr = Array.from(map.values());
    const { col, dir } = teamSort;
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (col === 'initials') { va = a.initials; vb = b.initials; }
      else if (col === 'total') { va = a.total; vb = b.total; }
      else if (col === 'inbound') { va = a.inbound; vb = b.inbound; }
      else if (col === 'outbound') { va = a.outbound; vb = b.outbound; }
      else if (col === 'avgDuration') { va = a.total > 0 ? a.totalDuration / a.total : 0; vb = b.total > 0 ? b.totalDuration / b.total : 0; }
      else if (col === 'matched') { va = a.matched; vb = b.matched; }
      if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filtered, teamData, teamSort]);

  // ── Unique team members for filter ───────────────────────────────────
  const teamMembers = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach((c) => { if (c.matched_team_initials) set.add(c.matched_team_initials); });
    return Array.from(set).sort();
  }, [filtered]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleTeamSort = (col: TeamSortCol) => {
    setTeamSort((prev) => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';

  // ── Detail panel renderer ────────────────────────────────────────────
  const renderDetailPanel = (c: DubberCallRecord) => {
    // Parse emotion JSON
    let emotions: { label: string; score: number }[] = [];
    if (c.document_emotion_json) {
      try {
        const raw = JSON.parse(c.document_emotion_json);
        if (raw && typeof raw === 'object') {
          emotions = Object.entries(raw)
            .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
            .map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), score: v as number }))
            .sort((a, b) => b.score - a.score);
        }
      } catch { /* ignore bad JSON */ }
    }

    const hasMeta = c.recording_type || c.channel || c.status || c.matched_team_initials;
    const hasTranscript = c.transcript && c.transcript.length > 0;
    const hasAiSnapshot = !!(c.summary_text || emotions.length > 0);

    return (
      <div className="calls-detail-panel">
        {/* Metadata row — always visible */}
        {hasMeta && (
          <div className="calls-detail-meta">
            {c.matched_team_initials && (
              <span className="calls-detail-meta-tag">
                <span className="calls-detail-meta-key">Team</span>
                {c.matched_team_initials}
                {c.match_strategy && <span style={{ opacity: 0.6 }}> ({c.match_strategy})</span>}
              </span>
            )}
            {c.recording_type && (
              <span className="calls-detail-meta-tag">
                <span className="calls-detail-meta-key">Type</span>
                {c.recording_type}
              </span>
            )}
            {c.channel && (
              <span className="calls-detail-meta-tag">
                <span className="calls-detail-meta-key">Channel</span>
                {c.channel}
              </span>
            )}
            {c.status && (
              <span className="calls-detail-meta-tag">
                <span className="calls-detail-meta-key">Status</span>
                {c.status}
              </span>
            )}
          </div>
        )}

        {/* View toggle — only when both views have data */}
        {hasTranscript && hasAiSnapshot && (
          <div className="calls-detail-toggle">
            <button
              className={`calls-detail-toggle-btn ${detailView === 'transcript' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setDetailView('transcript'); }}
            >
              Transcript
            </button>
            <button
              className={`calls-detail-toggle-btn ${detailView === 'ai' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setDetailView('ai'); }}
            >
              AI Snapshot
            </button>
          </div>
        )}

        {/* ── Transcript view (default) ── */}
        {(detailView === 'transcript' || !hasAiSnapshot) && hasTranscript && (
          <div className="calls-detail-transcript">
            {/* Participants header */}
            <div className="calls-transcript-participants">
              <span className="calls-transcript-participant">
                <span className="calls-transcript-participant-role">From</span>
                {c.from_label || c.from_party || '—'}
              </span>
              <span className="calls-transcript-participant-sep">↔</span>
              <span className="calls-transcript-participant">
                <span className="calls-transcript-participant-role">To</span>
                {c.to_label || c.to_party || '—'}
              </span>
              {c.duration_seconds != null && (
                <span className="calls-transcript-participant-duration">{fmtDuration(c.duration_seconds)}</span>
              )}
            </div>
            <div className="calls-transcript-lines">
              {(() => {
                // Check if all speakers are the same (e.g. "Multiple speakers") — hide redundant column
                const uniqueSpeakers = new Set(c.transcript.map((s) => s.speaker || 'Speaker'));
                const showSpeakers = uniqueSpeakers.size > 1;
                return c.transcript.map((s) => {
                  const sSent = s.sentiment != null
                    ? s.sentiment > 0.1 ? 'positive' : s.sentiment < -0.1 ? 'negative' : 'neutral'
                    : null;
                  return (
                    <div key={s.sentence_index} className={`calls-transcript-line ${showSpeakers ? '' : 'no-speaker'}`}>
                      {showSpeakers ? (
                        <span className="calls-transcript-speaker">
                          {s.speaker || 'Speaker'}
                        </span>
                      ) : (
                        <span className="calls-transcript-index">{s.sentence_index + 1}</span>
                      )}
                      <span className="calls-transcript-content">{s.content}</span>
                      {sSent && <span className={`calls-transcript-sentiment ${sSent}`} title={sSent} />}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="calls-transcript-count">
              {c.transcript.length} sentence{c.transcript.length !== 1 ? 's' : ''}
              <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
              Speaker labels unavailable (Dubber diarisation pending)
            </div>
          </div>
        )}

        {/* ── AI Snapshot view ── */}
        {(detailView === 'ai' || !hasTranscript) && hasAiSnapshot && (
          <>
            {/* Emotion breakdown */}
            {emotions.length > 0 && (
              <div className="calls-detail-emotions">
                <div className="calls-section-title" style={{ marginBottom: 6 }}>Emotions</div>
                <div className="calls-emotion-bars">
                  {emotions.map((e) => (
                    <div key={e.label} className="calls-emotion-row">
                      <span className="calls-emotion-label">{e.label}</span>
                      <div className="calls-emotion-track">
                        <div className="calls-emotion-fill" style={{ width: `${Math.round(e.score * 100)}%` }} />
                      </div>
                      <span className="calls-emotion-pct">{Math.round(e.score * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {c.summary_text && (
              <div className="calls-detail-summary">
                <div className="calls-section-title" style={{ marginBottom: 6 }}>Summary</div>
                <p style={{ margin: 0, lineHeight: 1.5 }}>{c.summary_text}</p>
              </div>
            )}

            {/* Transcript (also shown in AI view) */}
            {hasTranscript && (
              <div className="calls-detail-transcript" style={{ marginTop: 10 }}>
                <div className="calls-section-title" style={{ marginBottom: 6 }}>Transcript</div>
                <div className="calls-transcript-lines">
                  {(() => {
                    const uniqueSpeakers = new Set(c.transcript.map((s) => s.speaker || 'Speaker'));
                    const showSpeakers = uniqueSpeakers.size > 1;
                    return c.transcript.map((s) => {
                      const sSent = s.sentiment != null
                        ? s.sentiment > 0.1 ? 'positive' : s.sentiment < -0.1 ? 'negative' : 'neutral'
                        : null;
                      return (
                        <div key={s.sentence_index} className={`calls-transcript-line ${showSpeakers ? '' : 'no-speaker'}`}>
                          {showSpeakers ? (
                            <span className="calls-transcript-speaker">{s.speaker || 'Speaker'}</span>
                          ) : (
                            <span className="calls-transcript-index">{s.sentence_index + 1}</span>
                          )}
                          <span className="calls-transcript-content">{s.content}</span>
                          {sSent && <span className={`calls-transcript-sentiment ${sSent}`} title={sSent} />}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="calls-transcript-count">
                  {c.transcript.length} sentence{c.transcript.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </>
        )}

        {/* Fallback if no transcript and no AI data */}
        {!hasTranscript && !hasAiSnapshot && !hasMeta && (
          <div style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B', fontSize: 12 }}>No detail available for this recording.</div>
        )}
      </div>
    );
  };

  // ── Toolbar extras: direction + team filters ─────────────────────────
  const toolbarExtras = (
    <div className="calls-filter-bar">
      {(['all', 'inbound', 'outbound'] as DirectionFilter[]).map((d) => (
        <button
          key={d}
          className={`calls-filter-chip ${dirFilter === d ? 'active' : ''}`}
          onClick={() => setDirFilter(d)}
        >
          {d === 'all' ? 'All' : d === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
        </button>
      ))}
      <select
        value={teamFilter}
        onChange={(e) => setTeamFilter(e.target.value)}
        style={{
          background: isDarkMode ? colours.dark.cardBackground : '#fff',
          color: textBody,
          border: `0.5px solid ${isDarkMode ? 'rgba(75,85,99,0.38)' : 'rgba(107,107,107,0.14)'}`,
          borderRadius: 0,
          padding: '4px 8px',
          fontFamily: 'Raleway, sans-serif',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <option value="all">All members</option>
        {teamMembers.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );

  // ── No data ──────────────────────────────────────────────────────────
  if (!dubberCalls) {
    return (
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastRefreshTimestamp} onRefresh={triggerRefresh} toolbarExtras={toolbarExtras}>
        <div className="calls-empty-state">Loading call data…</div>
      </ReportShell>
    );
  }

  if (dubberCalls.length === 0) {
    return (
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastRefreshTimestamp} onRefresh={triggerRefresh} toolbarExtras={toolbarExtras}>
        <div className="calls-empty-state">No call recordings found.</div>
      </ReportShell>
    );
  }

  return (
    <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastRefreshTimestamp} onRefresh={triggerRefresh} toolbarExtras={toolbarExtras}>
      {/* ── Section 1: Summary Metrics ───────────────────────────────── */}
      <ReportingSectionCard title="Overview" animationDelay={0} variant="minimal">
        <div className="calls-report-metrics">
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: textPrimary }}>{metrics.totalCalls}</div>
            <div className="calls-metric-label">Total Calls</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: colours.green }}>{metrics.externalCount}</div>
            <div className="calls-metric-label">External</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: colours.orange }}>{metrics.internalCount}</div>
            <div className="calls-metric-label">Internal</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: textPrimary }}>{fmtDuration(metrics.avgDuration)}</div>
            <div className="calls-metric-label">Avg Duration</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: colours.highlight }}>{metrics.matchedEnquiry}</div>
            <div className="calls-metric-label">Enquiry Matches</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: colours.green }}>{metrics.positiveCount}</div>
            <div className="calls-metric-label">Positive</div>
          </div>
          <div className="calls-report-metric-card">
            <div className="calls-metric-value" style={{ color: colours.cta }}>{metrics.negativeCount}</div>
            <div className="calls-metric-label">Negative</div>
          </div>
        </div>
      </ReportingSectionCard>

      {/* ── Section 2: Team Breakdown ────────────────────────────────── */}
      <ReportingSectionCard title="Team Breakdown" animationDelay={0.1}>
        {teamBreakdown.length === 0 ? (
          <div className="calls-empty-state">No team data for this period.</div>
        ) : (
          <table className="calls-team-table">
            <thead>
              <tr>
                {([
                  ['initials', 'Member'],
                  ['total', 'Total'],
                  ['inbound', 'Inbound'],
                  ['outbound', 'Outbound'],
                  ['avgDuration', 'Avg Duration'],
                  ['matched', 'Enquiry Matches'],
                ] as [TeamSortCol, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    className={teamSort.col === col ? 'sorted' : ''}
                    onClick={() => handleTeamSort(col)}
                  >
                    {label} {teamSort.col === col ? (teamSort.dir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamBreakdown.map((row) => (
                <tr key={row.initials}>
                  <td style={{ fontWeight: 700, color: textPrimary }}>{row.name}</td>
                  <td style={{ color: textBody }}>{row.total}</td>
                  <td style={{ color: colours.green }}>{row.inbound}</td>
                  <td style={{ color: colours.highlight }}>{row.outbound}</td>
                  <td style={{ color: textBody }}>{fmtDuration(row.total > 0 ? row.totalDuration / row.total : 0)}</td>
                  <td style={{ color: row.matched > 0 ? colours.highlight : textBody }}>{row.matched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportingSectionCard>

      {/* ── Section 3: Call Log ──────────────────────────────────────── */}
      <ReportingSectionCard
        title="Call Log"
        animationDelay={0.2}
        actions={
          <div className="calls-filter-bar" style={{ gap: 6 }}>
            {(['external', 'internal'] as TabFilter[]).map((t) => (
              <button
                key={t}
                className={`calls-filter-chip ${tabFilter === t ? 'active' : ''}`}
                onClick={() => setTabFilter(t)}
              >
                {t === 'external' ? 'External' : 'Internal'}
              </button>
            ))}
          </div>
        }
      >
        {tabFilter === 'external' ? (
          visibleExternal.length === 0 ? (
            <div className="calls-empty-state">No external calls match these filters.</div>
          ) : (
            <div>
              {/* Column header */}
              <div className="calls-log-row" style={{ borderBottom: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.38)' : 'rgba(107,107,107,0.14)'}`, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? '#A0A0A0' : '#6B6B6B', cursor: 'default' }}>
                <span>Date/Time</span>
                <span>From</span>
                <span>To</span>
                <span>Duration</span>
                <span>Sentiment</span>
                <span>Match</span>
              </div>
              {visibleExternal.map((c) => {
                const dir = inferDirection(c);
                const sent = sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment);
                const isExpanded = expandedId === c.recording_id;
                return (
                  <React.Fragment key={c.recording_id}>
                    <div
                      className={`calls-log-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => { setExpandedId(isExpanded ? null : c.recording_id); if (!isExpanded) setDetailView('transcript'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="calls-log-time">{fmtDateTime(c.start_time_utc)}</span>
                      <span className="calls-log-party" style={{ color: textPrimary }}>
                        <span className={`calls-direction-badge ${dir}`} style={{ marginRight: 4 }}>
                          {dir === 'inbound' ? '↓' : '↑'}
                        </span>
                        {c.from_label || c.from_party || '—'}
                      </span>
                      <span className="calls-log-party" style={{ color: textBody }}>
                        {c.to_label || c.to_party || '—'}
                      </span>
                      <span className="calls-log-duration">{fmtDuration(c.duration_seconds)}</span>
                      <span><span className={`calls-sentiment-badge ${sent.cls}`}>{sent.label}</span></span>
                      <span>
                        {c.resolved_name ? (
                          <span className="calls-enquiry-pill">{c.resolved_name}</span>
                        ) : c.enquiry_ref ? (
                          <span className="calls-enquiry-pill">#{c.enquiry_ref}</span>
                        ) : (
                          <span style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B', fontSize: 12 }}>—</span>
                        )}
                      </span>
                    </div>
                    {isExpanded && renderDetailPanel(c)}
                  </React.Fragment>
                );
              })}
            </div>
          )
        ) : (
          /* Internal calls */
          internal.length === 0 ? (
            <div className="calls-empty-state">No internal calls in this period.</div>
          ) : (
            <div>
              <div className="calls-internal-row" style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? '#A0A0A0' : '#6B6B6B', borderBottom: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.38)' : 'rgba(107,107,107,0.14)'}` }}>
                <span>Date/Time</span>
                <span>From</span>
                <span>To</span>
                <span>Duration</span>
                <span>Sentiment</span>
              </div>
              {internal.map((c) => {
                const sent = sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment);
                const isExpanded = expandedId === c.recording_id;
                return (
                  <React.Fragment key={c.recording_id}>
                    <div
                      className={`calls-internal-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => { setExpandedId(isExpanded ? null : c.recording_id); if (!isExpanded) setDetailView('transcript'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 12, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>{fmtDateTime(c.start_time_utc)}</span>
                      <span style={{ fontWeight: 600, color: textPrimary }}>{c.from_label || c.from_party || '—'}</span>
                      <span style={{ color: textBody }}>{c.to_label || c.to_party || '—'}</span>
                      <span style={{ fontSize: 12, color: textBody }}>{fmtDuration(c.duration_seconds)}</span>
                      <span><span className={`calls-sentiment-badge ${sent.cls}`}>{sent.label}</span></span>
                    </div>
                    {isExpanded && renderDetailPanel(c)}
                  </React.Fragment>
                );
              })}
            </div>
          )
        )}
      </ReportingSectionCard>

      {/* ── Section 4: Enquiry-Linked Calls ─────────────────────────── */}
      <ReportingSectionCard title="Enquiry-Linked Calls" animationDelay={0.3} variant="minimal">
        {(() => {
          const linked = external.filter((c) => c.enquiry_ref || c.resolved_name);
          if (linked.length === 0) return <div className="calls-empty-state">No calls matched to enquiries in this period.</div>;

          // Group by area of work
          const byArea = new Map<string, DubberCallRecord[]>();
          for (const c of linked) {
            const area = c.area_of_work || 'Unknown';
            if (!byArea.has(area)) byArea.set(area, []);
            byArea.get(area)!.push(c);
          }

          const areaColour = (a: string): string => {
            const lower = a.toLowerCase();
            if (lower.includes('commercial')) return colours.highlight;
            if (lower.includes('construction')) return colours.orange;
            if (lower.includes('property')) return colours.green;
            if (lower.includes('employment')) return colours.yellow;
            return colours.greyText;
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from(byArea.entries()).map(([area, calls]) => (
                <div key={area}>
                  <div className="calls-section-title" style={{ color: areaColour(area) }}>
                    {area} ({calls.length})
                  </div>
                  {calls.map((c) => (
                    <div key={c.recording_id} className="calls-log-row" style={{ gridTemplateColumns: '110px 1fr 80px 80px' }}>
                      <span className="calls-log-time">{fmtDateTime(c.start_time_utc)}</span>
                      <span style={{ fontWeight: 600, color: textPrimary }}>
                        {c.resolved_name || c.from_label || c.from_party || '—'}
                        {c.enquiry_ref && <span className="calls-enquiry-pill" style={{ marginLeft: 6 }}>#{c.enquiry_ref}</span>}
                      </span>
                      <span className="calls-log-duration">{fmtDuration(c.duration_seconds)}</span>
                      <span><span className={`calls-sentiment-badge ${sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment).cls}`}>{sentimentLabel(c.document_sentiment_score, c.ai_document_sentiment).label}</span></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </ReportingSectionCard>
    </ReportShell>
  );
};

export default React.memo(CallsReport);
