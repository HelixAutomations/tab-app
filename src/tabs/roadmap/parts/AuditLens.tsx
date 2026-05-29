// src/tabs/roadmap/parts/AuditLens.tsx
// Operator god-mode P3 — Audit lens (pressure-release valve).
// Brief: docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md §3.
//
// UX intent: type any user's initials, instantly see every action they took
// (and every system event fired for them) in a window. One-click drill into
// the originating form submission. Hide background noise by default.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import {
  fetchAuditTeam,
  fetchAuditTimeline,
  type AuditRow,
  type AuditStats,
  type AuditTimelineResponse,
  type TeamMember,
} from '../../../utils/auditClient';

interface AuditLensProps {
  initials: string | null;
  isDarkMode: boolean;
}

type RangePreset = 'today' | 'yesterday' | '7d' | 'custom';

function computeRange(preset: RangePreset, customSince?: string, customUntil?: string): { since: string; until: string } {
  const now = new Date();
  if (preset === 'custom' && customSince && customUntil) {
    return { since: new Date(customSince).toISOString(), until: new Date(customUntil).toISOString() };
  }
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { since: start.toISOString(), until: end.toISOString() };
  }
  // 7d
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { since: start.toISOString(), until: now.toISOString() };
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'.replace('—', '-');
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '-';
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusColour(status: AuditRow['status'], isDark: boolean): string {
  if (status === 'ok') return colours.green || '#3F9142';
  if (status === 'error') return colours.cta;
  if (status === 'warning') return colours.orange || '#D89C2A';
  return isDark ? colours.subtleGrey : colours.greyText;
}

function kindColour(kind: AuditRow['kind']): string {
  if (kind === 'user') return colours.highlight;
  if (kind === 'system') return colours.helixBlue;
  return colours.subtleGrey;
}

const AuditLens: React.FC<AuditLensProps> = ({ initials: viewerInitials, isDarkMode }) => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [query, setQuery] = useState<string>(() => (viewerInitials || '').toUpperCase());
  const [submittedInitials, setSubmittedInitials] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customSince, setCustomSince] = useState<string>('');
  const [customUntil, setCustomUntil] = useState<string>('');
  const [includeBackground, setIncludeBackground] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<AuditTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load team list once for autocomplete.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchAuditTeam(ctrl.signal).then(setTeam).catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const runQuery = useCallback(async (initials: string) => {
    if (!initials) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setSelected(null);
    const range = computeRange(preset, customSince, customUntil);
    try {
      const result = await fetchAuditTimeline(initials, { ...range, includeBackground }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!result?.ok) {
        setError('Could not load audit timeline.');
        setData(null);
      } else {
        setData(result);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setError('Could not load audit timeline.');
        setData(null);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [preset, customSince, customUntil, includeBackground]);

  // Re-run when the active initials, preset, range, or background toggle changes.
  useEffect(() => {
    if (submittedInitials) runQuery(submittedInitials);
  }, [submittedInitials, preset, customSince, customUntil, includeBackground, runQuery]);

  const onSearch = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = (query || '').toUpperCase().trim();
    if (!clean) return;
    setSubmittedInitials(clean);
  }, [query]);

  // Open the matching form-submission detail in the Forms tab.
  const openInForms = useCallback((row: AuditRow) => {
    const submissionId = row.extras?.submissionId || row.extras?.matchedSubmissionId;
    if (!submissionId) return;
    try {
      window.dispatchEvent(new CustomEvent('navigateToForms', { detail: { focusSubmissionId: String(submissionId) } }));
    } catch {
      /* no-op */
    }
  }, []);

  const stats: AuditStats | null = data?.stats || null;

  const subtleText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const surfaceBg = isDarkMode ? colours.dark.cardBackground : '#FFFFFF';
  const surfaceBorder = isDarkMode ? colours.dark.border : '#E5E7EB';
  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;

  const rows = data?.rows || [];

  return (
    <div
      style={{
        fontFamily: 'Raleway, sans-serif',
        color: textColour,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: subtleText, marginBottom: 4 }}>
          God Mode
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Audit Lens</div>
        <div style={{ fontSize: 13, color: subtleText, marginTop: 4, maxWidth: 640 }}>
          Search any user. See everything they did and everything that fired for them.
          Open the form, find the orphan, take action without leaving this view.
        </div>
      </div>

      {/* Search + range controls */}
      <form
        onSubmit={onSearch}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: 12,
          background: surfaceBg,
          border: `1px solid ${surfaceBorder}`,
          borderRadius: 0,
        }}
      >
        <input
          aria-label="User initials"
          list="audit-team-initials"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Initials (e.g. LZ)"
          style={{
            fontFamily: 'inherit',
            fontSize: 14,
            padding: '8px 10px',
            border: `1px solid ${surfaceBorder}`,
            borderRadius: 0,
            background: isDarkMode ? colours.dark.background : '#FFF',
            color: textColour,
            minWidth: 160,
            textTransform: 'uppercase',
          }}
        />
        <datalist id="audit-team-initials">
          {team.map((m) => (
            <option key={m.initials} value={m.initials}>{m.name || m.initials}</option>
          ))}
        </datalist>
        <button
          type="submit"
          style={{
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 16px',
            background: colours.cta,
            color: '#FFF',
            border: 'none',
            borderRadius: 0,
            cursor: 'pointer',
          }}
        >
          Search
        </button>

        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {(['today', 'yesterday', '7d', 'custom'] as RangePreset[]).map((p) => {
            const active = preset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 12,
                  padding: '6px 12px',
                  background: active ? colours.highlight : 'transparent',
                  color: active ? '#FFF' : textColour,
                  border: `1px solid ${active ? colours.highlight : surfaceBorder}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {p === '7d' ? 'Last 7d' : p}
              </button>
            );
          })}
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="datetime-local"
              value={customSince}
              onChange={(e) => setCustomSince(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 12, padding: 6, border: `1px solid ${surfaceBorder}`, borderRadius: 0, background: isDarkMode ? colours.dark.background : '#FFF', color: textColour }}
            />
            <span style={{ fontSize: 12, color: subtleText }}>to</span>
            <input
              type="datetime-local"
              value={customUntil}
              onChange={(e) => setCustomUntil(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 12, padding: 6, border: `1px solid ${surfaceBorder}`, borderRadius: 0, background: isDarkMode ? colours.dark.background : '#FFF', color: textColour }}
            />
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12, color: subtleText, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeBackground} onChange={(e) => setIncludeBackground(e.target.checked)} />
          Show background noise
        </label>
      </form>

      {/* Stats banner */}
      {submittedInitials && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: 12,
            background: surfaceBg,
            border: `1px solid ${surfaceBorder}`,
            borderRadius: 0,
            alignItems: 'center',
          }}
        >
          <StatPill label="Events" value={stats?.total ?? (loading ? '…' : 0)} colour={textColour} />
          <StatPill label="User actions" value={stats?.user ?? 0} colour={kindColour('user')} />
          <StatPill label="System" value={stats?.system ?? 0} colour={kindColour('system')} />
          {includeBackground && <StatPill label="Background" value={stats?.background ?? 0} colour={kindColour('background')} />}
          <StatPill label="Failed" value={stats?.error ?? 0} colour={colours.cta} emphasise={(stats?.error ?? 0) > 0} />
          <StatPill label="Warnings" value={stats?.warning ?? 0} colour={colours.orange || '#D89C2A'} />
          {stats && stats.orphans > 0 && (
            <StatPill label="Orphan submissions" value={stats.orphans} colour={colours.cta} emphasise />
          )}
          {stats?.truncated && (
            <span style={{ fontSize: 11, color: subtleText, marginLeft: 'auto' }}>capped at {stats.total} rows — narrow the window for more</span>
          )}
          {stats && stats.sourceErrors.length > 0 && (
            <span style={{ fontSize: 11, color: colours.orange || '#D89C2A', marginLeft: 'auto' }}>
              partial result — {stats.sourceErrors.join(', ')} unavailable
            </span>
          )}
        </div>
      )}

      {/* Timeline + drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            background: surfaceBg,
            border: `1px solid ${surfaceBorder}`,
            borderRadius: 0,
            minHeight: 320,
          }}
        >
          {!submittedInitials && (
            <EmptyState
              isDarkMode={isDarkMode}
              title="Type initials, press Search."
              body="The lens will pull together every form, submission, AI proposal, and telemetry event for that user in the chosen window. Nothing fires until you search."
            />
          )}
          {submittedInitials && loading && rows.length === 0 && <SkeletonRows isDarkMode={isDarkMode} />}
          {submittedInitials && !loading && error && (
            <EmptyState isDarkMode={isDarkMode} title="Something went wrong" body={error} tone="error" />
          )}
          {submittedInitials && !loading && !error && rows.length === 0 && (
            <EmptyState
              isDarkMode={isDarkMode}
              title={`No events for ${submittedInitials} in this window`}
              body="Try a wider range, or toggle background noise to see passive activity. If you expected to see a form submission here, this is also the place where an orphan would surface."
            />
          )}
          {rows.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  isDarkMode={isDarkMode}
                  active={selected?.id === row.id}
                  onClick={() => setSelected(row)}
                />
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <DetailDrawer
            row={selected}
            isDarkMode={isDarkMode}
            onClose={() => setSelected(null)}
            onOpenInForms={() => openInForms(selected)}
          />
        )}
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: number | string; colour: string; emphasise?: boolean }> = ({ label, value, colour, emphasise }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      padding: '6px 10px',
      border: `1px solid ${colour}`,
      borderRadius: 0,
      background: emphasise ? colour : 'transparent',
      color: emphasise ? '#FFF' : colour,
      fontSize: 12,
      fontWeight: 600,
    }}
  >
    <span style={{ fontSize: 14, fontWeight: 800 }}>{value}</span>
    <span style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>{label}</span>
  </div>
);

const Row: React.FC<{ row: AuditRow; isDarkMode: boolean; active: boolean; onClick: () => void }> = ({ row, isDarkMode, active, onClick }) => {
  const border = isDarkMode ? colours.dark.border : '#E5E7EB';
  const hoverBg = isDarkMode ? colours.dark.cardHover : '#F4F4F6';
  const sc = statusColour(row.status, isDarkMode);
  const kc = kindColour(row.kind);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          background: active ? hoverBg : 'transparent',
          border: 'none',
          borderBottom: `1px solid ${border}`,
          borderLeft: `3px solid ${sc}`,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'inherit',
          display: 'grid',
          gridTemplateColumns: '88px 90px 1fr',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontVariantNumeric: 'tabular-nums' }}>
          {formatTimestamp(row.timestamp)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: kc, textTransform: 'uppercase', letterSpacing: 0.8 }}>{row.kind}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: 0.8 }}>{row.status}</span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
          <span style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.sourceLabel} · {row.summary}
          </span>
        </span>
      </button>
    </li>
  );
};

const DetailDrawer: React.FC<{ row: AuditRow; isDarkMode: boolean; onClose: () => void; onOpenInForms: () => void }> = ({ row, isDarkMode, onClose, onOpenInForms }) => {
  const surfaceBg = isDarkMode ? colours.dark.cardBackground : '#FFFFFF';
  const surfaceBorder = isDarkMode ? colours.dark.border : '#E5E7EB';
  const subtleText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const canOpenInForms = !!(row.extras?.submissionId || row.extras?.matchedSubmissionId);
  return (
    <aside
      style={{
        position: 'sticky',
        top: 8,
        background: surfaceBg,
        border: `1px solid ${surfaceBorder}`,
        borderRadius: 0,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: subtleText, textTransform: 'uppercase', letterSpacing: 1 }}>Event detail</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          style={{ background: 'transparent', border: 'none', color: subtleText, cursor: 'pointer', fontSize: 16, padding: 4 }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{row.title}</div>
      <div style={{ fontSize: 12, color: subtleText }}>{row.sourceLabel}</div>
      <div style={{ fontSize: 12 }}>
        <strong>When:</strong> {row.timestamp ? new Date(row.timestamp).toLocaleString('en-GB') : 'unknown'}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{row.summary}</div>
      {canOpenInForms && (
        <button
          type="button"
          onClick={onOpenInForms}
          style={{
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 14px',
            background: colours.cta,
            color: '#FFF',
            border: 'none',
            borderRadius: 0,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Open in Forms
        </button>
      )}
      <div>
        <div style={{ fontSize: 10, color: subtleText, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Metadata</div>
        <pre
          style={{
            fontSize: 11,
            padding: 8,
            background: isDarkMode ? colours.dark.background : colours.grey,
            border: `1px solid ${surfaceBorder}`,
            margin: 0,
            overflow: 'auto',
            maxHeight: 240,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(row.extras || {}, null, 2)}
        </pre>
      </div>
    </aside>
  );
};

const SkeletonRows: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const border = isDarkMode ? colours.dark.border : '#E5E7EB';
  const bar = isDarkMode ? colours.dark.cardHover : '#EDEDF0';
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} style={{ padding: '12px 14px', borderBottom: `1px solid ${border}`, display: 'grid', gridTemplateColumns: '88px 90px 1fr', gap: 12 }}>
          <span style={{ height: 12, background: bar }} />
          <span style={{ height: 12, background: bar }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ height: 12, background: bar, width: '60%' }} />
            <span style={{ height: 10, background: bar, width: '85%', opacity: 0.6 }} />
          </span>
        </li>
      ))}
    </ul>
  );
};

const EmptyState: React.FC<{ isDarkMode: boolean; title: string; body: string; tone?: 'info' | 'error' }> = ({ isDarkMode, title, body, tone = 'info' }) => {
  const accent = tone === 'error' ? colours.cta : colours.highlight;
  const subtleText = isDarkMode ? colours.subtleGrey : colours.greyText;
  return (
    <div style={{ padding: 32, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>{tone === 'error' ? 'Error' : 'Ready'}</span>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: subtleText, maxWidth: 520, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
};

export default AuditLens;
