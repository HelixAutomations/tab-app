import React, { useCallback, useState } from 'react';
import AsanaProjectMirror from '../parts/AsanaProjectMirror';
import AsanaTaskInspector from '../parts/AsanaTaskInspector';
import SystemTaskBoardEditor from './board-editor/SystemTaskBoardEditor';
import { StatusPill, StatusTone, SystemPageHeader } from './shared';

const DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);

interface SystemTasksViewProps {
  isDarkMode: boolean;
  viewerInitials?: string | null;
  onBack: () => void;
  onOpenDashboard: () => void;
}

interface MonitorTile {
  label: string;
  value: string;
  status: StatusTone;
  route: string;
}

const monitorTiles: MonitorTile[] = [
  {
    label: 'Asana',
    value: 'read',
    status: 'live',
    route: 'projects + tasks',
  },
  {
    label: 'Mirror',
    value: 'boards',
    status: 'live',
    route: 'task boards',
  },
  {
    label: 'Probe',
    value: 'gid / url',
    status: 'live',
    route: 'task inspector',
  },
  {
    label: 'Writes',
    value: 'off',
    status: 'blocked',
    route: 'no mutations',
  },
];

const SystemTasksView: React.FC<SystemTasksViewProps> = ({ isDarkMode, viewerInitials, onBack, onOpenDashboard }) => {
  const initials = viewerInitials || null;
  const isDevPreview = DEV_PREVIEW_INITIALS.has(String(initials || '').toUpperCase());
  const [editorTarget, setEditorTarget] = useState<{ gid: string; name: string; teamName: string | null } | null>(null);

  const handleOpenEditor = useCallback((project: { gid: string; name: string; teamName: string | null }) => {
    setEditorTarget(project);
  }, []);

  const handleCloseEditor = useCallback(() => setEditorTarget(null), []);

  if (isDevPreview && editorTarget) {
    return (
      <SystemTaskBoardEditor
        initials={initials}
        viewMode="roadmap"
        isDarkMode={isDarkMode}
        projectId={editorTarget.gid}
        projectName={editorTarget.name}
        teamName={editorTarget.teamName}
        boardTeamName="Team Tasks"
        onClose={handleCloseEditor}
      />
    );
  }

  return (
    <main className="system-tasks-monitor" data-helix-region="system/tasks">
      <SystemPageHeader
        eyebrow="System"
        title="Tasks"
        isDarkMode={isDarkMode}
        onBack={onBack}
        onOpenDashboard={onOpenDashboard}
      />

      <section className="system-tasks-command-strip" data-helix-region="system/tasks/status">
        <div className="system-tasks-command-main">
          <span className="system-tasks-kicker">Internal monitoring</span>
          <h2>Task monitor</h2>
        </div>
        <div className="system-tasks-status-grid">
          {monitorTiles.map((tile) => (
            <article key={tile.label} className="system-tasks-stat">
              <div className="system-tasks-stat-top">
                <span className="system-tasks-stat-label">{tile.label}</span>
                <StatusPill tone={tile.status} isDarkMode={isDarkMode} />
              </div>
              <strong className="system-tasks-stat-value">{tile.value}</strong>
              <span className="system-tasks-stat-route">{tile.route}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="system-tasks-panels" data-helix-region="system/tasks/panels">
        <section className="system-tasks-panel system-tasks-panel--mirror" data-helix-region="system/tasks/asana-board">
          <div className="system-tasks-panel-head">
            <div className="system-tasks-panel-title">
              <span>Board</span>
              <h3>Asana board</h3>
            </div>
            <StatusPill tone="live" isDarkMode={isDarkMode} />
          </div>
          <AsanaProjectMirror
            initials={initials}
            viewMode="roadmap"
            boardTeamName="Team Tasks"
            preferBoardTeam
            showBoardSelector
            onOpenEditor={isDevPreview ? handleOpenEditor : undefined}
          />
        </section>

        <section className="system-tasks-panel system-tasks-panel--probe" data-helix-region="system/tasks/task-probe">
          <div className="system-tasks-panel-head">
            <div className="system-tasks-panel-title">
              <span>Probe</span>
              <h3>Task lookup</h3>
            </div>
            <StatusPill tone="live" isDarkMode={isDarkMode} />
          </div>
          <AsanaTaskInspector initials={initials} viewMode="roadmap" />
        </section>
      </section>
    </main>
  );
};

export default SystemTasksView;