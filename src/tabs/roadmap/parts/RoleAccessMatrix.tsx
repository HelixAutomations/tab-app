// src/tabs/roadmap/parts/RoleAccessMatrix.tsx
//
// Role & access matrix — dev-owner reference key.
// Phase Access.2: pulls live grants from /api/access/grants and uses them to
// populate the tier rows. Static fallback rows are kept so the panel still
// renders if the endpoint 404s (older server build) or returns 403 (caller
// not LZ — non-LZ devs shouldn't see the matrix anyway, this is just safety).
//
// Code stays the source of capability vocabulary (see src/app/capabilities.ts
// + the tier-summary structure here). The TABLE is the source of who has
// what — every row in the Members column comes from /api/access/grants.

import * as React from 'react';

interface RawGrant {
  GrantId: string;
  Subject: string;
  Capability: string;
  ResourceScope: string | null;
  Effect: 'allow' | 'deny';
  Source: 'default' | 'override' | 'pilot';
  Priority: number;
  GrantedBy: string;
  GrantedAt: string;
  ExpiresAt: string | null;
  Reason: string | null;
}

interface CapabilityDef {
  key: string;
  kind: 'tier' | 'feature' | 'action';
  label: string;
  description: string;
}

interface MatrixRow {
  tier: string;
  members: string;
  scope: string;
  features: string;
}

const STATIC_FALLBACK_ROWS: MatrixRow[] = [
  {
    tier: 'Owner',
    members: 'LZ',
    scope: 'God mode · firm-wide data',
    features: 'All admin + dev preview, Activity tab, Operator Actions (incl. write actions), DebugLatencyOverlay, CCL diff drawer, cache monitor, live monitor.',
  },
  {
    tier: 'Preview',
    members: '— (empty after AC promotion)',
    scope: 'Reserved for future preview pilots',
    features: 'Currently identical to dev; reserved tier for staged feature rollout before promoting to admin.',
  },
  {
    tier: 'Admin',
    members: 'AC, KW, JW, LA, LD, EA, WH',
    scope: 'Personal data scope',
    features: 'Admin support surfaces, annual leave admin, user-switching, and support-only form/compliance views. Reports excludes LA and LD; Forms stream is LZ, AC, KW, EA, LD, WH; all calls is LZ, AC, JW, LA.',
  },
  {
    tier: 'User',
    members: 'Everyone else',
    scope: 'Personal data scope',
    features: 'Home, Enquiries, Matters, Instructions, CCL to-do items.',
  },
];

const ROLE_MATRIX_NOTES: string[] = [
  'Members come from /api/access/grants (live). Defaults seeded from src/app/admin.ts on Access.1 migration.',
  'Mutations land in the LZ-only Access panel; avoid direct SQL edits unless recovering a broken grant.',
  'isDevOwner = caller is LZ. canAccessReports / canSeeFirmWideHomeData seeds also live in the table now.',
  'Firm-wide Home billing is LZ, KW, LD, EA, WH only. Home To Do/L&D support streams use the admin group. Forms stream is LZ, AC, KW, EA, LD, WH. All calls is LZ, AC, JW, LA and separate from firm-wide Home billing.',
  'Operator Actions: 11 read-only lookups now admin-tier. matter-oneoff-replay (write) stays dev-only.',
];

const COLOURS = {
  panelBg: 'var(--surface-card)',
  panelBorder: 'var(--border-base)',
  rowBorderStrong: 'var(--border-strong)',
  rowBorder: 'var(--border-base)',
  textPrimary: 'var(--text-primary)',
  textBody: 'var(--text-body)',
  textMuted: 'var(--text-muted)',
  accent: 'var(--helix-highlight)',
  warn: 'var(--status-warning)',
  cta: 'var(--status-error)',
};

function membersFromGrants(grants: RawGrant[], capability: string): string[] {
  return grants
    .filter((g) => g.Capability === capability && g.Effect === 'allow')
    .map((g) => g.Subject)
    .map((s) => (s.startsWith('user:') ? s.slice(5) : s))
    .sort();
}

function deriveLiveRows(grants: RawGrant[]): MatrixRow[] {
  const dev = membersFromGrants(grants, 'tier:dev');
  const admin = membersFromGrants(grants, 'tier:admin');
  return [
    {
      tier: 'Owner',
      members: dev.length ? dev.join(', ') : '—',
      scope: 'God mode · firm-wide data',
      features: 'All admin + dev preview, Activity tab, Operator Actions (incl. write actions), DebugLatencyOverlay, CCL diff drawer, cache monitor.',
    },
    {
      tier: 'Preview',
      members: '— (reserved)',
      scope: 'Reserved for future preview pilots',
      features: 'Currently empty; reserved tier for staged feature rollout before promoting to admin.',
    },
    {
      tier: 'Admin',
      members: admin.length ? admin.join(', ') : '—',
      scope: 'Personal data scope',
      features: 'Admin support surfaces, annual leave admin, user-switching, and support-only form/compliance views. Reports excludes LA and LD; Forms stream is LZ, AC, KW, EA, LD, WH; all calls is LZ, AC, JW, LA.',
    },
    {
      tier: 'User',
      members: 'Everyone else',
      scope: 'Personal data scope',
      features: 'Home, Enquiries, Matters, Instructions, CCL to-do items.',
    },
  ];
}

interface Props {
  region?: string;
  defaultOpen?: boolean;
}

const RoleAccessMatrix: React.FC<Props> = ({ region = 'system/role-matrix', defaultOpen = false }) => {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);
  const [grants, setGrants] = React.useState<RawGrant[] | null>(null);
  const [capabilities, setCapabilities] = React.useState<CapabilityDef[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showLiveGrants, setShowLiveGrants] = React.useState<boolean>(false);
  const [showImplementationDetails, setShowImplementationDetails] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!open || grants !== null) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch('/api/access/grants', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`grants ${r.status}`)),
      ),
      fetch('/api/access/capabilities', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`capabilities ${r.status}`)),
      ),
    ])
      .then(([gRes, cRes]) => {
        if (cancelled) return;
        setGrants(Array.isArray(gRes?.grants) ? gRes.grants : []);
        setCapabilities(Array.isArray(cRes?.capabilities) ? cRes.capabilities : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'fetch-failed');
        setGrants([]); // marker so we don't refetch in a loop
        setCapabilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, grants]);

  const rows: MatrixRow[] = React.useMemo(() => {
    if (!grants || grants.length === 0) return STATIC_FALLBACK_ROWS;
    return deriveLiveRows(grants);
  }, [grants]);

  const liveBadge =
    grants && grants.length > 0
      ? { label: `${grants.length} grants live`, colour: COLOURS.accent }
      : error
      ? { label: `static fallback · ${error}`, colour: COLOURS.warn }
      : { label: loading ? 'loading…' : 'static', colour: COLOURS.textMuted };

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 10,
        border: `1px solid ${COLOURS.panelBorder}`,
        background: COLOURS.panelBg,
      }}
      data-helix-region={region}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          color: COLOURS.textPrimary,
        }}
      >
        <span>
          Access model{' '}
          <span style={{ marginLeft: 8, fontSize: 10, color: liveBadge.colour, fontWeight: 600 }}>
            ({liveBadge.label})
          </span>
        </span>
        <span style={{ fontSize: 10, color: COLOURS.textMuted }}>{open ? '▾ hide' : '▸ show'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: COLOURS.textBody }}>
            <thead>
              <tr style={{ textAlign: 'left', color: COLOURS.textPrimary, borderBottom: `1px solid ${COLOURS.rowBorderStrong}` }}>
                <th style={{ padding: '6px 8px', fontWeight: 700, width: '12%' }}>Role</th>
                <th style={{ padding: '6px 8px', fontWeight: 700, width: '24%' }}>People</th>
                <th style={{ padding: '6px 8px', fontWeight: 700, width: '22%' }}>Data scope</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>What they can do</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tier} style={{ borderBottom: `1px solid ${COLOURS.rowBorder}`, verticalAlign: 'top' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: COLOURS.accent, fontWeight: 700 }}>{row.tier}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{row.members}</td>
                  <td style={{ padding: '6px 8px' }}>{row.scope}</td>
                  <td style={{ padding: '6px 8px', lineHeight: 1.45 }}>{row.features}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {grants && grants.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowLiveGrants((v) => !v)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  color: COLOURS.textMuted,
                }}
              >
                {showLiveGrants ? '▾ hide raw grants' : `▸ show raw grants (${grants.length})`}
              </button>
              {showLiveGrants && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 8, color: COLOURS.textBody }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: COLOURS.textPrimary, borderBottom: `1px solid ${COLOURS.rowBorderStrong}` }}>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Capability</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Subject</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Effect</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Source</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Reason</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={g.GrantId} style={{ borderBottom: `1px solid ${COLOURS.rowBorder}` }}>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: COLOURS.accent }}>{g.Capability}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{g.Subject}</td>
                        <td style={{ padding: '4px 8px', color: g.Effect === 'deny' ? COLOURS.cta : COLOURS.textBody, fontWeight: g.Effect === 'deny' ? 700 : 400 }}>{g.Effect}</td>
                        <td style={{ padding: '4px 8px', color: g.Source === 'default' ? COLOURS.textMuted : COLOURS.warn }}>{g.Source}</td>
                        <td style={{ padding: '4px 8px', color: COLOURS.textMuted }}>{g.Reason || '—'}</td>
                        <td style={{ padding: '4px 8px', color: COLOURS.textMuted }}>{g.ExpiresAt || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowImplementationDetails((v) => !v)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                color: COLOURS.textMuted,
              }}
            >
              {showImplementationDetails ? '▾ hide implementation detail' : '▸ show implementation detail'}
            </button>
          </div>

          {showImplementationDetails && (
            <>
              {capabilities && capabilities.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: COLOURS.textMuted, lineHeight: 1.5 }}>
                  <strong style={{ color: COLOURS.textPrimary, fontWeight: 600 }}>Capabilities ({capabilities.length}):</strong>{' '}
                  {capabilities.map((c) => c.key).join(' · ')}
                </div>
              )}

              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 11, color: COLOURS.textMuted, lineHeight: 1.5 }}>
                {ROLE_MATRIX_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RoleAccessMatrix;
