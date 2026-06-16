import * as React from 'react';
import { CAPABILITIES } from '../../../app/capabilities';
import {
  ACTIVITY_TAB_USERS,
  ADMIN_USERS,
  DEMO_MODE_CONTROL_USERS,
  EXTRA_TOP_NAV_USERS,
  FIRM_WIDE_HOME_USERS,
  PRIVATE_HUB_CONTROL_USERS,
  SESSION_MODE_CONTROL_USERS,
} from '../../../app/admin';

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

type AccessTone = 'allow' | 'partial' | 'local' | 'deny';

interface SubjectRow {
  key: string;
  label: string;
  caption: string;
  initials?: string;
  general?: boolean;
}

interface SurfaceRule {
  key: string;
  label: string;
  description: string;
  audienceLabel: string;
  allowed?: readonly string[];
  mode?: 'listed' | 'admin-opt-in' | 'local-only';
}

const SUBJECT_ROWS: SubjectRow[] = [
  { key: 'lz', label: 'LZ', caption: 'Dev owner', initials: 'LZ' },
  { key: 'ac', label: 'AC', caption: 'Dev group', initials: 'AC' },
  { key: 'ea', label: 'EA', caption: 'Prod viewer', initials: 'EA' },
  { key: 'kw', label: 'KW', caption: 'Admin', initials: 'KW' },
  { key: 'jw', label: 'JW', caption: 'Admin', initials: 'JW' },
  { key: 'la', label: 'LA', caption: 'Admin', initials: 'LA' },
  { key: 'wh', label: 'WH', caption: 'Admin', initials: 'WH' },
  { key: 'user', label: 'User', caption: 'Everyone else', general: true },
];

const SURFACE_RULES: SurfaceRule[] = [
  {
    key: 'system',
    label: 'System',
    description: 'Top-level System tab, ops pulse, route checks, and activity surfaces.',
    audienceLabel: ACTIVITY_TAB_USERS.join(', '),
    allowed: ACTIVITY_TAB_USERS,
  },
  {
    key: 'dataHub',
    label: 'Data Hub',
    description: 'Promoted top-level data spine and ledger workspace.',
    audienceLabel: EXTRA_TOP_NAV_USERS.join(', '),
    allowed: EXTRA_TOP_NAV_USERS,
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Top navigation Reports suite in the current shell.',
    audienceLabel: EXTRA_TOP_NAV_USERS.join(', '),
    allowed: EXTRA_TOP_NAV_USERS,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Top navigation Marketing workspace.',
    audienceLabel: EXTRA_TOP_NAV_USERS.join(', '),
    allowed: EXTRA_TOP_NAV_USERS,
  },
  {
    key: 'firmHome',
    label: 'Firm Home',
    description: 'Built-in firm-wide Home data, plus admin browser opt-in.',
    audienceLabel: `${FIRM_WIDE_HOME_USERS.join(', ')} + admin opt-in`,
    allowed: FIRM_WIDE_HOME_USERS,
    mode: 'admin-opt-in',
  },
  {
    key: 'controls',
    label: 'Controls',
    description: 'Private hub controls, debug overlay, CCL diff, and cache tools.',
    audienceLabel: PRIVATE_HUB_CONTROL_USERS.join(', '),
    allowed: PRIVATE_HUB_CONTROL_USERS,
  },
  {
    key: 'session',
    label: 'Session',
    description: 'Local support/session mode controls.',
    audienceLabel: SESSION_MODE_CONTROL_USERS.join(', '),
    allowed: SESSION_MODE_CONTROL_USERS,
  },
  {
    key: 'demo',
    label: 'Demo',
    description: 'Demo-mode controls and presenter tooling.',
    audienceLabel: DEMO_MODE_CONTROL_USERS.join(', '),
    allowed: DEMO_MODE_CONTROL_USERS,
  },
  {
    key: 'ccl',
    label: 'CCL local',
    description: 'CCL operations are clipped to localhost while containment holds.',
    audienceLabel: 'Localhost only',
    mode: 'local-only',
  },
];

function normaliseSubject(subject: string): string {
  return subject.startsWith('user:') ? subject.slice(5) : subject;
}

function accessForSurface(surface: SurfaceRule, subject: SubjectRow): { tone: AccessTone; label: string; title: string } {
  if (surface.mode === 'local-only') {
    return {
      tone: 'local',
      label: 'Local',
      title: `${surface.label}: localhost only`,
    };
  }

  if (subject.general || !subject.initials) {
    return {
      tone: 'deny',
      label: 'Off',
      title: `${surface.label}: not part of the extra access group`,
    };
  }

  if (surface.allowed?.includes(subject.initials)) {
    return {
      tone: 'allow',
      label: 'On',
      title: `${surface.label}: enabled for ${subject.initials}`,
    };
  }

  if (surface.mode === 'admin-opt-in' && ADMIN_USERS.includes(subject.initials as typeof ADMIN_USERS[number])) {
    return {
      tone: 'partial',
      label: 'Opt',
      title: `${surface.label}: admin can opt in per browser`,
    };
  }

  return {
    tone: 'deny',
    label: 'Off',
    title: `${surface.label}: not enabled for ${subject.initials}`,
  };
}

const SystemAccessMatrix: React.FC<{ region?: string }> = ({ region = 'system/access-matrix' }) => {
  const [grants, setGrants] = React.useState<RawGrant[]>([]);
  const [capabilities, setCapabilities] = React.useState<CapabilityDef[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [showLiveGrants, setShowLiveGrants] = React.useState<boolean>(false);
  const [showImplementationDetails, setShowImplementationDetails] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch('/api/access/grants', { credentials: 'include' }).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`grants ${response.status}`)),
      ),
      fetch('/api/access/capabilities', { credentials: 'include' }).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`capabilities ${response.status}`)),
      ),
    ])
      .then(([grantsResponse, capabilitiesResponse]) => {
        if (cancelled) return;
        setGrants(Array.isArray(grantsResponse?.grants) ? grantsResponse.grants : []);
        setCapabilities(Array.isArray(capabilitiesResponse?.capabilities) ? capabilitiesResponse.capabilities : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'fetch-failed');
        setGrants([]);
        setCapabilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const registryCapabilities = React.useMemo<CapabilityDef[]>(() => {
    if (capabilities.length > 0) return capabilities;
    return Object.values(CAPABILITIES).map((capability) => ({
      key: capability.key,
      kind: capability.kind,
      label: capability.label,
      description: capability.description,
    }));
  }, [capabilities]);

  const allowCount = grants.filter((grant) => grant.Effect === 'allow').length;
  const denyCount = grants.filter((grant) => grant.Effect === 'deny').length;
  const liveBadge = grants.length > 0
    ? `${grants.length} grants live`
    : error
      ? `static fallback / ${error}`
      : loading
        ? 'loading access grants'
        : 'static fallback';

  const dotGridStyle = React.useMemo<React.CSSProperties>(() => ({
    gridTemplateColumns: `minmax(118px, 0.95fr) repeat(${SURFACE_RULES.length}, minmax(66px, 1fr))`,
  }), []);

  return (
    <section className="system-access-matrix" data-helix-region={region}>
      <div className="system-access-matrix-head">
        <div className="system-access-matrix-brand">
          <span className="system-access-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <div>
            <div className="system-access-eyebrow">Access model</div>
            <h2 className="system-access-title">Who sees what</h2>
            <p className="system-access-copy">
              Top-nav surfaces, feature gates, and data-scope exceptions in one live reference.
            </p>
          </div>
        </div>
        <div className="system-access-live-stack">
          <span className={`system-access-live-badge ${error ? 'system-access-live-badge--warn' : ''}`}>{liveBadge}</span>
          <span>{allowCount} allow / {denyCount} deny / {registryCapabilities.length} capabilities</span>
        </div>
      </div>

      <div className="system-access-dot-wrap">
        <div className="system-access-dot-grid" style={dotGridStyle} role="table" aria-label="Feature access dot matrix">
          <div className="system-access-dot-header system-access-dot-header--subject" role="columnheader">Person</div>
          {SURFACE_RULES.map((surface) => (
            <div key={surface.key} className="system-access-dot-header" role="columnheader" title={surface.description}>
              {surface.label}
            </div>
          ))}

          {SUBJECT_ROWS.map((subject) => (
            <React.Fragment key={subject.key}>
              <div className="system-access-subject-cell" role="rowheader">
                <strong>{subject.label}</strong>
                <span>{subject.caption}</span>
              </div>
              {SURFACE_RULES.map((surface) => {
                const state = accessForSurface(surface, subject);
                return (
                  <div key={`${subject.key}-${surface.key}`} className="system-access-dot-cell" role="cell" title={state.title}>
                    <span className={`system-access-dot system-access-dot--${state.tone}`} aria-hidden="true" />
                    <span className="system-access-dot-label">{state.label}</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="system-access-detail-actions">
        {grants.length > 0 && (
          <button type="button" className="system-access-link-button" onClick={() => setShowLiveGrants((current) => !current)}>
            {showLiveGrants ? 'Hide raw grants' : `Show raw grants (${grants.length})`}
          </button>
        )}
        <button type="button" className="system-access-link-button" onClick={() => setShowImplementationDetails((current) => !current)}>
          {showImplementationDetails ? 'Hide implementation detail' : 'Show implementation detail'}
        </button>
      </div>

      {showLiveGrants && grants.length > 0 && (
        <div className="system-access-table-wrap">
          <table className="system-access-raw-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Subject</th>
                <th>Effect</th>
                <th>Source</th>
                <th>Reason</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.GrantId}>
                  <td>{grant.Capability}</td>
                  <td>{grant.Subject}</td>
                  <td data-effect={grant.Effect}>{grant.Effect}</td>
                  <td>{grant.Source}</td>
                  <td>{grant.Reason || 'None'}</td>
                  <td>{grant.ExpiresAt || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImplementationDetails && (
        <div className="system-access-implementation">
          <p>
            <strong>Capability vocabulary:</strong> {registryCapabilities.map((capability) => capability.key).join(', ')}
          </p>
          <ul>
            <li>Live grants come from /api/access/grants; capability vocabulary comes from src/app/capabilities.ts.</li>
            <li>Top-nav visibility is deliberately narrower while System and Data Hub settle as production-facing internal tools.</li>
            <li>Data scope is separate from feature access. Use isDevOwner() for data scope and isAdminUser() for feature gates.</li>
            <li>Grant and revoke mutations live in the LZ-only Access panel; direct SQL edits are recovery-only.</li>
          </ul>
        </div>
      )}
    </section>
  );
};

export default SystemAccessMatrix;