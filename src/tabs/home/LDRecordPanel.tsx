import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { FiBookOpen, FiExternalLink } from 'react-icons/fi';
import { colours, withAlpha } from '../../app/styles/colours';
import { buildRequestAuthHeaders } from '../../utils/requestAuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types — kept aligned with server/routes/registers.js learning-dev shapes.
// ─────────────────────────────────────────────────────────────────────────────

export interface LDActivity {
  id: number;
  plan_id: number;
  activity_date: string;
  activity_type: string;
  description: string;
  hours: number;
  provider: string | null;
  evidence_url: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LDPlan {
  id: number;
  initials: string;
  full_name: string;
  year: number;
  target_hours: number;
  total_hours: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  activities: LDActivity[];
}

interface Props {
  /** Current user's initials (used for `Mine` filter and headers). */
  userInitials: string;
  /** Whether the current user can request the firm-wide view. */
  canViewAll: boolean;
  /** Active scope when the toggle is shown. */
  scope: 'mine' | 'all';
  isDarkMode: boolean;
  /** Opens the full Registers L&D modal in Home. */
  onOpenFullRecord: () => void;
  /** Optional: open the L&D form (new plan / log activity). Defaults to the
   *  Resources tab — set in Home so we don't duplicate routing. */
  onOpenLDForm?: (mode: 'plan' | 'activity', initials?: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small, on-brand helpers.
// ─────────────────────────────────────────────────────────────────────────────

const formatDate = (iso: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

const clampPct = (used: number, target: number): number => {
  if (!target || target <= 0) return 0;
  const pct = (used / target) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
};

const ProgressStrip: React.FC<{ used: number; target: number; isDarkMode: boolean }> = ({ used, target, isDarkMode }) => {
  const pct = clampPct(used, target);
  const remaining = Math.max(0, target - used);
  const trackBg = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
  const fill = isDarkMode ? colours.accent : colours.highlight;
  const labelColour = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 4px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: 'var(--font-primary)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: labelColour, letterSpacing: 0.2 }}>
          {used}h <span style={{ color: muted, fontWeight: 500 }}>/ {target}h</span>
        </span>
        <span style={{ fontSize: 11, color: muted }}>
          {remaining > 0 ? `${remaining}h to go` : 'target met'}
        </span>
      </div>
      <div style={{ position: 'relative', width: '100%', height: 4, background: trackBg, borderRadius: 0, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            background: fill,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

const LDRecordPanel: React.FC<Props> = ({
  userInitials,
  canViewAll,
  scope,
  isDarkMode,
  onOpenFullRecord,
  onOpenLDForm,
}) => {
  const [plans, setPlans] = useState<LDPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = buildRequestAuthHeaders(
        userInitials ? { 'x-helix-initials': userInitials } : undefined,
      );
      if (!headers.has('x-helix-initials') && !headers.has('x-user-email') && !headers.has('x-helix-entra-id')) {
        return;
      }
      const res = await fetch(`/api/registers/learning-dev?year=${year}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to load');
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load L&D record');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [userInitials, year]);

  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const ownInitialsUpper = userInitials.toUpperCase();

  const ownPlan = useMemo(
    () => (plans || []).find((p) => p.initials.toUpperCase() === ownInitialsUpper) || null,
    [plans, ownInitialsUpper]
  );

  // ─── Theme tokens ────────────────────────────────────────────────────────
  const labelText = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.06)';

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 22,
              background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.05)',
              animation: 'opsDashFadeIn 0.5s ease both',
            }}
          />
        ))}
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ fontSize: 12, color: colours.cta, padding: '6px 4px' }}>
        {error}
      </div>
    );
  }

  // ─── "All" view (admins/ops/dev only) ─────────────────────────────────────
  if (scope === 'all' && canViewAll) {
    const sorted = (plans || []).slice().sort((a, b) => {
      const ratioA = a.target_hours > 0 ? a.total_hours / a.target_hours : 1;
      const ratioB = b.target_hours > 0 ? b.total_hours / b.target_hours : 1;
      return ratioA - ratioB; // lowest progress first — surfaces who's behind
    });

    if (sorted.length === 0) {
      return (
        <div style={{ fontSize: 12, color: muted, padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>No CPD plans for {year} yet.</span>
          <button
            type="button"
            onClick={onOpenFullRecord}
            style={{
              alignSelf: 'flex-start',
              appearance: 'none', border: 'none', background: 'transparent',
              padding: 0, fontSize: 11, fontWeight: 600,
              color: accent, cursor: 'pointer', fontFamily: 'var(--font-primary)',
            }}
          >
            Open full record →
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 6px', borderBottom: `1px solid ${rowBorder}` }}>
          <span style={{ fontSize: 11, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {sorted.length} plan{sorted.length === 1 ? '' : 's'} · {year}
          </span>
          <button
            type="button"
            onClick={onOpenFullRecord}
            style={{
              appearance: 'none', border: 'none', background: 'transparent',
              padding: 0, fontSize: 11, fontWeight: 600,
              color: accent, cursor: 'pointer', fontFamily: 'var(--font-primary)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            Full record <FiExternalLink size={11} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((p) => {
            const pct = clampPct(p.total_hours, p.target_hours);
            const isMine = p.initials.toUpperCase() === ownInitialsUpper;
            return (
              <button
                key={p.id}
                type="button"
                onClick={onOpenFullRecord}
                title={`${p.full_name} — ${p.total_hours}/${p.target_hours}h`}
                style={{
                  appearance: 'none', border: 'none', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 4px',
                  background: isMine ? withAlpha(accent, isDarkMode ? 0.06 : 0.05) : 'transparent',
                  borderBottom: `1px solid ${rowBorder}`,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-primary)',
                }}
              >
                <span
                  style={{
                    minWidth: 26, height: 18, padding: '0 5px',
                    borderRadius: 0,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: isMine ? accent : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)'),
                    color: isMine ? (isDarkMode ? colours.darkBlue : '#ffffff') : muted,
                    flexShrink: 0,
                  }}
                >
                  {p.initials.toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: bodyText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.full_name}
                </span>
                <span style={{ fontSize: 11, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {p.total_hours}/{p.target_hours}h
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 36, height: 3,
                    background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)',
                    position: 'relative', flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${pct}%`,
                      background: accent,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── "Mine" view ─────────────────────────────────────────────────────────

  if (!ownPlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' }}>
        <span style={{ fontSize: 12, color: bodyText, fontFamily: 'var(--font-primary)' }}>
          No CPD plan for {year} yet.
        </span>
        <span style={{ fontSize: 11, color: muted, fontFamily: 'var(--font-primary)' }}>
          Start a plan to track training, hours, and evidence for the year.
        </span>
        <button
          type="button"
          onClick={() => onOpenLDForm?.('plan', userInitials)}
          style={{
            alignSelf: 'flex-start',
            appearance: 'none', border: `1px solid ${accent}`, background: 'transparent',
            padding: '4px 10px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: accent, cursor: 'pointer', fontFamily: 'var(--font-primary)',
            borderRadius: 0,
          }}
        >
          Start {year} plan
        </button>
      </div>
    );
  }

  const recentActivities = (ownPlan.activities || []).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ProgressStrip used={ownPlan.total_hours} target={ownPlan.target_hours} isDarkMode={isDarkMode} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 6px', borderBottom: `1px solid ${rowBorder}` }}>
        <span style={{ fontSize: 11, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {recentActivities.length === 0 ? `No activities yet · ${year}` : `Latest activities · ${year}`}
        </span>
        <button
          type="button"
          onClick={onOpenFullRecord}
          style={{
            appearance: 'none', border: 'none', background: 'transparent',
            padding: 0, fontSize: 11, fontWeight: 600,
            color: accent, cursor: 'pointer', fontFamily: 'var(--font-primary)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        >
          Full record <FiExternalLink size={11} />
        </button>
      </div>

      {recentActivities.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 4px' }}>
          <span style={{ fontSize: 11, color: muted, fontFamily: 'var(--font-primary)' }}>
            Log your first CPD activity to start tracking hours.
          </span>
          <button
            type="button"
            onClick={() => onOpenLDForm?.('activity', userInitials)}
            style={{
              alignSelf: 'flex-start',
              appearance: 'none', border: `1px solid ${accent}`, background: 'transparent',
              padding: '4px 10px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: accent, cursor: 'pointer', fontFamily: 'var(--font-primary)',
              borderRadius: 0,
            }}
          >
            Log activity
          </button>
        </div>
      )}

      {recentActivities.map((act) => (
        <div
          key={act.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '52px minmax(0,1fr) auto',
            alignItems: 'baseline',
            gap: 8,
            padding: '6px 4px',
            borderBottom: `1px solid ${rowBorder}`,
            fontFamily: 'var(--font-primary)',
          }}
          title={act.description || act.activity_type}
        >
          <span style={{ fontSize: 10, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>
            {formatDate(act.activity_date)}
          </span>
          <span style={{ fontSize: 12, color: bodyText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {act.description || act.activity_type}
            {act.provider && (
              <span style={{ color: muted, fontSize: 11 }}> · {act.provider}</span>
            )}
          </span>
          <span style={{ fontSize: 11, color: labelText, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {act.hours}h
          </span>
        </div>
      ))}
    </div>
  );
};

export default LDRecordPanel;
export { FiBookOpen as LDRecordIcon };
