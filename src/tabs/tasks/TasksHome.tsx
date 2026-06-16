import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { useTheme } from '../../app/functionality/ThemeContext';
import { UserData } from '../../app/functionality/types';
import { getApiBase } from '../../utils/getApiUrl';
import AsanaProjectMirror from '../roadmap/parts/AsanaProjectMirror';
import AsanaTaskInspector from '../roadmap/parts/AsanaTaskInspector';
import SystemTaskBoardEditor from '../roadmap/system/board-editor/SystemTaskBoardEditor';
import '../roadmap/Activity.css';
import './TasksHome.css';

const DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);

type TechTicketType = 'idea' | 'problem';

interface TechTicketItem {
  type: TechTicketType;
  id: number;
  created_at: string;
  submitted_by: string | null;
  title: string;
  status: string | null;
}

interface TasksHomeProps {
  userData?: UserData[] | null;
}

interface QueueMetric {
  label: string;
  value: string;
  note: string;
  tone: 'live' | 'watch' | 'gap' | 'planned';
}

function getStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').toLowerCase().trim();
  if (!normalized || normalized === 'submitted') return 'Pending review';
  if (normalized === 'asana_created') return 'Logged';
  if (normalized === 'asana_failed') return 'Asana failed';
  return status || 'Pending review';
}

function getStatusTone(status: string | null | undefined): 'live' | 'watch' | 'gap' {
  const normalized = String(status || '').toLowerCase().trim();
  if (normalized === 'asana_created') return 'live';
  if (normalized === 'asana_failed') return 'gap';
  return 'watch';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatType(type: TechTicketType): string {
  return type === 'idea' ? 'Idea' : 'Problem';
}

const TasksHome: React.FC<TasksHomeProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();
  const currentUser = userData?.[0] || null;
  const initials = String(currentUser?.Initials || '').toUpperCase().trim() || null;
  const isDevPreview = DEV_PREVIEW_INITIALS.has(initials || '');
  const [items, setItems] = useState<TechTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ gid: string; name: string; teamName: string | null } | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/tech-tickets/ledger?limit=30&type=all`);
      if (!response.ok) throw new Error(`Tech ticket ledger HTTP ${response.status}`);
      const json = (await response.json().catch(() => ({ items: [] }))) as { items?: TechTicketItem[] };
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task intake');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const metrics = useMemo<QueueMetric[]>(() => {
    const pending = items.filter((item) => !item.status || item.status === 'submitted').length;
    const logged = items.filter((item) => item.status === 'asana_created').length;
    const failed = items.filter((item) => item.status === 'asana_failed').length;
    return [
      { label: 'Intake', value: String(items.length), note: 'recent ideas and problems', tone: items.length > 0 ? 'live' : 'planned' },
      { label: 'Needs triage', value: String(pending), note: 'waiting for review', tone: pending > 0 ? 'watch' : 'live' },
      { label: 'Logged', value: String(logged), note: 'sent through current Asana flow', tone: 'live' },
      { label: 'Attention', value: String(failed), note: 'integration failures', tone: failed > 0 ? 'gap' : 'live' },
    ];
  }, [items]);

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
        onClose={() => setEditorTarget(null)}
      />
    );
  }

  return (
    <main className="tasks-home" data-helix-region="tab/tasks">
      <section className="tasks-home__masthead" data-helix-region="tasks/masthead">
        <div className="tasks-home__masthead-main">
          <span className="tasks-home__eyebrow">Hub tasking</span>
          <h1>Tasks</h1>
          <p>Hub-owned intake and task control. Asana stays connected as a mirror and control panel while the Hub lifecycle proves itself.</p>
        </div>
        <div className="tasks-home__masthead-actions">
          <button type="button" className="tasks-home__button" onClick={() => void loadQueue()} disabled={loading}>
            <FiRefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="tasks-home__metrics" data-helix-region="tasks/metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className={`tasks-home__metric tasks-home__metric--${metric.tone}`}>
            <span className="tasks-home__metric-label">{metric.label}</span>
            <strong>{metric.value}</strong>
            <span>{metric.note}</span>
          </article>
        ))}
      </section>

      <section className="tasks-home__grid" data-helix-region="tasks/workspace">
        <section className="tasks-home__panel tasks-home__panel--queue" data-helix-region="tasks/hub-intake">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Hub queue</span>
              <h2>Tech intake</h2>
            </div>
            <span className="tasks-home__panel-count">{loading ? 'loading' : `${items.length} rows`}</span>
          </div>

          {error ? <div className="tasks-home__notice tasks-home__notice--error">{error}</div> : null}
          {!error && loading ? <div className="tasks-home__notice">Loading recent task intake.</div> : null}
          {!error && !loading && items.length === 0 ? <div className="tasks-home__notice">No recent tech intake rows.</div> : null}

          {!loading && items.length > 0 ? (
            <div className="tasks-home__ticket-list">
              {items.map((item) => {
                const tone = getStatusTone(item.status);
                return (
                  <article key={`${item.type}-${item.id}`} className="tasks-home__ticket" data-helix-region={`tasks/hub-intake/${item.type}-${item.id}`}>
                    <div className="tasks-home__ticket-topline">
                      <span>{formatType(item.type)} #{item.id}</span>
                      <span className={`tasks-home__status tasks-home__status--${tone}`}>{getStatusLabel(item.status)}</span>
                    </div>
                    <h3>{item.title || 'Untitled task intake'}</h3>
                    <div className="tasks-home__ticket-meta">
                      <span>{formatDate(item.created_at)}</span>
                      {item.submitted_by ? <span>{item.submitted_by}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="tasks-home__panel tasks-home__panel--plan" data-helix-region="tasks/hub-plan">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Control model</span>
              <h2>Small first loop</h2>
            </div>
          </div>
          <div className="tasks-home__lane-list">
            <article>
              <span>1</span>
              <strong>Check for existing work</strong>
              <p>First AI mode only compares tech ideas and problems for duplicate, open, or similar tickets.</p>
            </article>
            <article>
              <span>2</span>
              <strong>Keep Hub canonical</strong>
              <p>Hub task state becomes the lifecycle source once the page proves reliable.</p>
            </article>
            <article>
              <span>3</span>
              <strong>Emit pickup only</strong>
              <p>To Do receives triage, testing, review, and verification actions rather than the whole backlog.</p>
            </article>
          </div>
        </section>
      </section>

      <section className="tasks-home__asana-grid" data-helix-region="tasks/asana">
        <section className="tasks-home__panel" data-helix-region="tasks/asana/board">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Adapter</span>
              <h2>Asana board</h2>
            </div>
          </div>
          <AsanaProjectMirror
            initials={initials}
            viewMode="roadmap"
            boardTeamName="Team Tasks"
            preferBoardTeam
            showBoardSelector
            onOpenEditor={isDevPreview ? setEditorTarget : undefined}
          />
        </section>

        <section className="tasks-home__panel" data-helix-region="tasks/asana/inspector">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Lookup</span>
              <h2>Task inspector</h2>
            </div>
          </div>
          <AsanaTaskInspector initials={initials} viewMode="roadmap" />
        </section>
      </section>
    </main>
  );
};

export default TasksHome;