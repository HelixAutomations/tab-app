import * as React from 'react';
import {
  ACTIVITY_TAB_USERS,
  ADMIN_USERS,
  CALLS_ALL_USERS,
  DEMO_MODE_CONTROL_USERS,
  EXTRA_TOP_NAV_USERS,
  FIRM_WIDE_HOME_USERS,
  FORM_STREAM_USERS,
  PRIVATE_HUB_CONTROL_USERS,
  REPORTS_USERS,
  SESSION_MODE_CONTROL_USERS,
  TASKS_TAB_USERS,
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

type AccessTone = 'allow' | 'local' | 'deny';

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
  mode?: 'listed' | 'local-only';
}

const SUBJECT_ROWS: SubjectRow[] = [
  { key: 'lz', label: 'LZ', caption: 'Dev owner', initials: 'LZ' },
  { key: 'ea', label: 'EA', caption: 'Operations admin', initials: 'EA' },
  { key: 'kw', label: 'KW', caption: 'Operations admin', initials: 'KW' },
  { key: 'ld', label: 'LD', caption: 'Reception admin', initials: 'LD' },
  { key: 'wh', label: 'WH', caption: 'Reception admin', initials: 'WH' },
  { key: 'ac', label: 'AC', caption: 'Admin', initials: 'AC' },
  { key: 'jw', label: 'JW', caption: 'Admin', initials: 'JW' },
  { key: 'la', label: 'LA', caption: 'Admin', initials: 'LA' },
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
    key: 'tasks',
    label: 'Tasks',
    description: 'Top-level Tasks canvas and Hub-native task intake workbench.',
    audienceLabel: TASKS_TAB_USERS.join(', '),
    allowed: TASKS_TAB_USERS,
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
    description: 'Reports tab.',
    audienceLabel: REPORTS_USERS.join(', '),
    allowed: REPORTS_USERS,
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
    label: 'Firm billing',
    description: 'Firm-wide Home billing, matters, and enquiry aggregates for dev, operations, and reception users who do not bill time.',
    audienceLabel: FIRM_WIDE_HOME_USERS.join(', '),
    allowed: FIRM_WIDE_HOME_USERS,
  },
  {
    key: 'homeSupportStreams',
    label: 'To Do/L&D',
    description: 'Home support stream scope for Everyone in To Do, L&D, and document-transfer support cards. Separate from firm billing.',
    audienceLabel: ADMIN_USERS.join(', '),
    allowed: ADMIN_USERS,
  },
  {
    key: 'allCalls',
    label: 'All calls',
    description: 'Call centre all-person scope. Kept separate from firm-wide Home billing.',
    audienceLabel: CALLS_ALL_USERS.join(', '),
    allowed: CALLS_ALL_USERS,
  },
  {
    key: 'formsStream',
    label: 'Forms stream',
    description: 'Form entries side pane and submission stream support view.',
    audienceLabel: FORM_STREAM_USERS.join(', '),
    allowed: FORM_STREAM_USERS,
  },
  {
    key: 'leaveAdmin',
    label: 'Leave admin',
    description: 'Annual leave employee picker, edit, delete, and admin create flow.',
    audienceLabel: ADMIN_USERS.join(', '),
    allowed: ADMIN_USERS,
  },
  {
    key: 'devTools',
    label: 'Dev tools',
    description: 'Debug overlay, CCL diff, cache tools, and private hub tools.',
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

  return {
    tone: 'deny',
    label: 'Off',
    title: `${surface.label}: not enabled for ${subject.initials}`,
  };
}

const SystemAccessMatrix: React.FC<{ region?: string }> = ({ region = 'system/access-matrix' }) => {
  const [grants, setGrants] = React.useState<RawGrant[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [showLiveGrants, setShowLiveGrants] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/access/grants', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`grants ${response.status}`)))
      .then((grantsResponse) => {
        if (cancelled) return;
        setGrants(Array.isArray(grantsResponse?.grants) ? grantsResponse.grants : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'fetch-failed');
        setGrants([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dotGridStyle = React.useMemo<React.CSSProperties>(() => ({
    gridTemplateColumns: `minmax(118px, 0.95fr) repeat(${SURFACE_RULES.length}, minmax(66px, 1fr))`,
  }), []);

  return (
    <section className="system-access-matrix" data-helix-region={region}>
      <div className="system-access-matrix-head">
        <div className="system-access-matrix-brand">
          <div>
            <h2 className="system-access-title">Access Matrix</h2>
          </div>
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


    </section>
  );
};

export default SystemAccessMatrix;