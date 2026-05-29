// src/tabs/roadmap/parts/DevConsolePanel.tsx
// System — dev-owner & user view (Phase G).
//   viewMode === 'dev'      → full Forge (writable for LZ).
//   viewMode === 'roadmap'  → Asana mirror + read-only whiteboard (LZ + AC).

import React, { useEffect, useMemo, useState } from 'react';
import RoadmapWhiteboard from './RoadmapWhiteboard';
import AsanaProjectMirror from './AsanaProjectMirror';
import AsanaTaskInspector from './AsanaTaskInspector';
import RoleAccessMatrix from './RoleAccessMatrix';
import AccessControlsPanel from './AccessControlsPanel';

interface DevConsolePanelProps {
  initials: string | null;
  isDevOwner: boolean;
  viewMode: 'dev' | 'roadmap';
  canToggle: boolean;
  onToggleViewMode?: (next: 'dev' | 'roadmap') => void;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface ChangelogEntry {
  date: string;
  title: string;
  details?: string;
  category: string;
}

interface BriefRisk {
  id: string | null;
  title: string;
  file: string;
  status: string;
  verified: string | null;
  ageDays: number | null;
  relationshipCount: number;
  conflictCount: number;
  staleRisk: number;
}

interface ToolEntry {
  id: string;
  label: string;
  command: string;
  surface: string;
  tone: Tone;
}

interface GeneratedArtifact {
  path: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
  regenerateCommand: string | null;
  markerExpected: boolean;
  hasGeneratedMarker: boolean | null;
}

interface UpgradeCandidate {
  id: string;
  phase: string;
  title: string;
  signal: string;
  outcome: string;
  tone: Tone;
}

interface ReadinessMetric {
  count: number;
  meta: string;
  tone: Tone;
}

interface ReadinessSummary {
  systemUsers: ReadinessMetric;
  adminSafeActions: ReadinessMetric;
  ownerOnlyWrites: ReadinessMetric;
  liveGrants: ReadinessMetric;
}

interface DevConsoleSummary {
  generatedAt: string;
  changelog: {
    total: number;
    last14Days: number;
    byCategory: Record<string, number>;
    latest: ChangelogEntry[];
  };
  stash: {
    total: number;
    open: number;
    stale: number;
    ready: number;
    done: number;
    withConflicts: number;
    highRisk: BriefRisk[];
  };
  readiness?: ReadinessSummary;
  tools: ToolEntry[];
  generatedArtifacts: GeneratedArtifact[];
  upgradeCandidates: UpgradeCandidate[];
}

function toneClass(tone?: Tone): string {
  return tone ? `activity-dev-tone--${tone}` : 'activity-dev-tone--neutral';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function markerLabel(artifact: GeneratedArtifact): string {
  if (!artifact.markerExpected) return artifact.regenerateCommand || 'source file';
  const command = artifact.regenerateCommand || 'generator';
  if (!artifact.exists) return command;
  return artifact.hasGeneratedMarker ? `${command} - marker ok` : `${command} - marker missing`;
}

const MetricCard: React.FC<{ label: string; value: string | number; meta?: string; tone?: Tone }> = ({ label, value, meta, tone = 'neutral' }) => (
  <div className={`activity-dev-metric ${toneClass(tone)}`}>
    <span className="activity-dev-label">{label}</span>
    <strong>{value}</strong>
    {meta && <small>{meta}</small>}
  </div>
);

const Section: React.FC<{ title: string; count?: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <section className="activity-dev-section">
    <div className="activity-dev-section-head">
      <h3>{title}</h3>
      {typeof count === 'number' && <span>{count}</span>}
    </div>
    {children}
  </section>
);

const DevConsolePanel: React.FC<DevConsolePanelProps> = ({ initials, isDevOwner, viewMode, canToggle, onToggleViewMode }) => {
  const [data, setData] = useState<DevConsoleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isRoadmapMode = viewMode === 'roadmap';

  const auth = useMemo(() => {
    const params = new URLSearchParams();
    if (initials) params.set('initials', initials);
    params.set('viewMode', viewMode);
    return `?${params.toString()}`;
  }, [initials, viewMode]);
  const authHeaders = useMemo((): Record<string, string> => {
    const headers: Record<string, string> = { 'x-forge-view-mode': viewMode };
    if (initials) headers['x-user-initials'] = initials;
    return headers;
  }, [initials, viewMode]);

  useEffect(() => {
    // Summary contains dev-only signals (changelog heat, brief risk, toolbelt).
    // Skip the fetch in roadmap mode — users don't need it.
    if (isRoadmapMode) {
      setLoading(false);
      return;
    }
    let disposed = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/dev-console/summary${auth}`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Forge summary HTTP ${res.status}`);
        const json = (await res.json()) as DevConsoleSummary;
        if (!disposed) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Failed to load Forge summary');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [auth, authHeaders, isRoadmapMode]);

  const renderToggle = () => {
    if (!canToggle || !onToggleViewMode) return null;
    return (
      <div className="activity-forge-view-toggle" role="group" aria-label="Forge view mode" data-helix-region="system/forge/view-toggle">
        <button
          type="button"
          aria-pressed={viewMode === 'dev'}
          onClick={() => onToggleViewMode('dev')}
        >
          Dev
        </button>
        <button
          type="button"
          aria-pressed={viewMode === 'roadmap'}
          onClick={() => onToggleViewMode('roadmap')}
        >
          Roadmap (user)
        </button>
      </div>
    );
  };

  // ── Roadmap (user view) ────────────────────────────────────────────────────
  if (isRoadmapMode) {
    return (
      <div className="activity-dev-console activity-dev-console--roadmap" data-helix-region="system/forge/roadmap">
        <div className="activity-dev-header">
          <div>
            <span className="activity-dev-eyebrow">Roadmap</span>
            <h2>What's on the board</h2>
          </div>
          {renderToggle()}
        </div>
        {canToggle && isDevOwner && (
          <div className="activity-forge-roadmap-banner" role="note">
            Previewing the user view. Switch back to Dev to write.
          </div>
        )}
        <AsanaProjectMirror initials={initials} viewMode={viewMode} />
        <AsanaTaskInspector initials={initials} viewMode={viewMode} />
        <RoadmapWhiteboard initials={initials} readOnly />
      </div>
    );
  }

  // ── Dev mode (LZ only realistically) ───────────────────────────────────────
  if (!isDevOwner) {
    // Defensive: if a non-owner somehow lands in dev mode, show the locked surface.
    return <div className="activity-dev-console activity-dev-locked">Operator controls are visible to the dev-owner only.</div>;
  }

  if (loading) {
    return (
      <div className="activity-dev-console" data-helix-region="system/forge">
        <div className="activity-dev-header">
          <div>
            <span className="activity-dev-eyebrow">System</span>
            <h2>System readiness</h2>
          </div>
          <div className="activity-dev-header-actions">
            {renderToggle()}
            <span className="activity-dev-pill">Loading...</span>
          </div>
        </div>
        <div className="activity-dev-grid activity-dev-grid--metrics">
          <MetricCard label="System users" value="-" />
          <MetricCard label="Admin-safe actions" value="-" />
          <MetricCard label="Owner-only writes" value="-" />
          <MetricCard label="Live grants" value="-" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="activity-dev-console activity-dev-error" data-helix-region="system/forge">
        {error || 'Controls unavailable'}
      </div>
    );
  }

  const readiness: ReadinessSummary = data.readiness || {
    systemUsers: { count: 0, meta: 'Summary unavailable', tone: 'warning' },
    adminSafeActions: { count: 0, meta: 'Summary unavailable', tone: 'warning' },
    ownerOnlyWrites: { count: 0, meta: 'Summary unavailable', tone: 'warning' },
    liveGrants: { count: 0, meta: 'Summary unavailable', tone: 'warning' },
  };

  return (
    <div className="activity-dev-console" data-helix-region="system/forge">
      <div className="activity-dev-header">
        <div>
          <span className="activity-dev-eyebrow">System</span>
          <h2>System readiness</h2>
        </div>
        <div className="activity-dev-header-actions">
          {renderToggle()}
          <span className="activity-dev-pill">Synced {formatDate(data.generatedAt)}</span>
        </div>
      </div>

      <div className="activity-dev-grid activity-dev-grid--metrics">
        <MetricCard label="System users" value={readiness.systemUsers.count} meta={readiness.systemUsers.meta} tone={readiness.systemUsers.tone} />
        <MetricCard label="Admin-safe actions" value={readiness.adminSafeActions.count} meta={readiness.adminSafeActions.meta} tone={readiness.adminSafeActions.tone} />
        <MetricCard label="Owner-only writes" value={readiness.ownerOnlyWrites.count} meta={readiness.ownerOnlyWrites.meta} tone={readiness.ownerOnlyWrites.tone} />
        <MetricCard label="Live grants" value={readiness.liveGrants.count} meta={readiness.liveGrants.meta} tone={readiness.liveGrants.tone} />
      </div>

      <RoleAccessMatrix region="system/forge/role-matrix" />

      <AccessControlsPanel />

      <RoadmapWhiteboard initials={initials} />

      <AsanaProjectMirror initials={initials} viewMode={viewMode} />

      <AsanaTaskInspector initials={initials} viewMode={viewMode} />

      <div className="activity-dev-grid activity-dev-grid--main">
        <Section title="Next deposits" count={data.upgradeCandidates.length}>
          <div className="activity-dev-card-list">
            {data.upgradeCandidates.map((candidate) => (
              <article key={candidate.id} className={`activity-dev-card ${toneClass(candidate.tone)}`}>
                <div className="activity-dev-card-head">
                  <strong>{candidate.title}</strong>
                  <span>Phase {candidate.phase}</span>
                </div>
                <p>{candidate.signal}</p>
                <small>{candidate.outcome}</small>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Stale briefs" count={data.stash.highRisk.length}>
          <div className="activity-dev-row-list">
            {data.stash.highRisk.map((brief) => (
              <div key={brief.id || brief.file} className={`activity-dev-row activity-dev-row--${brief.status}`}>
                <div>
                  <strong>{brief.title}</strong>
                  <small>{brief.id || brief.file}</small>
                </div>
                <span>{brief.ageDays ?? '-'}d</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Recent changes" count={data.changelog.latest.length}>
          <div className="activity-dev-row-list">
            {data.changelog.latest.map((entry) => (
              <div key={`${entry.date}-${entry.title}`} className="activity-dev-row">
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.category}</small>
                </div>
                <span>{formatDate(entry.date)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Toolbelt" count={data.tools.length}>
          <div className="activity-dev-card-list activity-dev-card-list--dense">
            {data.tools.map((tool) => (
              <article key={tool.id} className={`activity-dev-tool ${toneClass(tool.tone)}`}>
                <strong>{tool.label}</strong>
                <code>{tool.command}</code>
                <small>{tool.surface}</small>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Generated artifacts" count={data.generatedArtifacts.length}>
          <div className="activity-dev-row-list">
            {data.generatedArtifacts.map((artifact) => (
              <div key={artifact.path} className={`activity-dev-row ${artifact.exists && (!artifact.markerExpected || artifact.hasGeneratedMarker) ? 'activity-dev-row--ok' : 'activity-dev-row--missing'}`}>
                <div>
                  <strong>{artifact.path}</strong>
                  <small>{markerLabel(artifact)}</small>
                </div>
                <span>{artifact.exists ? formatBytes(artifact.sizeBytes) : 'missing'}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
};

export default DevConsolePanel;