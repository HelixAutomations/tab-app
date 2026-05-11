// src/tabs/roadmap/parts/SignalsInboxPanel.tsx
// System lens for the unified signals inbox.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface SignalsInboxPanelProps {
  initials: string | null;
  isAllowed: boolean;
  onCountChange?: (count: number) => void;
}

type SignalSource = 'tech_problem' | 'tech_idea' | 'roadmap' | 'stash' | 'agent_health' | 'agent_stash';

interface SignalItem {
  id: string;
  source: SignalSource | string;
  title: string;
  detail?: string | null;
  file_ref?: string | null;
  submitted_by?: string | null;
  status: string;
  severity?: string | null;
  promoted_to?: string | null;
  asana_task_gid?: string | null;
  source_record_id?: string | null;
  metadata_json?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const SOURCE_META: Record<SignalSource, { label: string; tone: 'danger' | 'success' | 'warning' | 'info' | 'neutral' }> = {
  tech_problem: { label: 'Problem', tone: 'danger' },
  tech_idea: { label: 'Idea', tone: 'success' },
  roadmap: { label: 'Roadmap', tone: 'neutral' },
  stash: { label: 'Brief', tone: 'warning' },
  agent_health: { label: 'Health', tone: 'info' },
  agent_stash: { label: 'Stash', tone: 'warning' },
};

function sourceMeta(source: string) {
  return SOURCE_META[source as SignalSource] || { label: source.replace(/_/g, ' '), tone: 'neutral' as const };
}

function toneClass(source: string): string {
  return `activity-signals-row--${sourceMeta(source).tone}`;
}

function formatAge(value?: string | null): string {
  if (!value) return '-';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const PlaceholderRows: React.FC = () => (
  <div className="activity-signals-list" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div key={index} className="activity-signals-row activity-signals-row--placeholder">
        <span />
        <div>
          <strong />
          <small />
        </div>
        <time />
        <span />
      </div>
    ))}
  </div>
);

const SignalsInboxPanel: React.FC<SignalsInboxPanelProps> = ({ initials, isAllowed, onCountChange }) => {
  const [items, setItems] = useState<SignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const auth = useMemo(() => {
    const params = new URLSearchParams({ status: 'open', limit: '80' });
    if (initials) params.set('initials', initials);
    return `?${params.toString()}`;
  }, [initials]);

  const authHeaders = useMemo((): Record<string, string> => (
    initials ? { 'x-user-initials': initials } : {}
  ), [initials]);

  const loadSignals = useCallback(async (background = false) => {
    if (!isAllowed) return;
    try {
      if (background) setRefreshing(true);
      else setLoading(true);
      const res = await fetch(`/api/signals${auth}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Signals HTTP ${res.status}`);
      const json = await res.json();
      const nextItems = Array.isArray(json?.items) ? json.items as SignalItem[] : [];
      setItems(nextItems);
      onCountChange?.(nextItems.length);
      setLastSyncAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth, authHeaders, isAllowed, onCountChange]);

  useEffect(() => {
    if (!isAllowed) return;
    let disposed = false;
    const run = async (background = false) => {
      if (disposed) return;
      await loadSignals(background);
    };
    void run(false);
    const intervalId = window.setInterval(() => void run(true), 120000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAllowed, loadSignals]);

  const dismiss = useCallback(async (id: string) => {
    if (!isAllowed) return;
    try {
      setDismissingId(id);
      const params = new URLSearchParams();
      if (initials) params.set('initials', initials);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/signals/${encodeURIComponent(id)}${suffix}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (!res.ok) throw new Error(`Dismiss HTTP ${res.status}`);
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss signal');
    } finally {
      setDismissingId(null);
    }
  }, [authHeaders, initials, isAllowed, onCountChange]);

  if (!isAllowed) {
    return (
      <div className="activity-dev-console activity-dev-locked" data-helix-region="system/signals">
        Signals are visible to the dev group only.
      </div>
    );
  }

  const groupedCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="activity-dev-console activity-signals" data-helix-region="system/signals">
      <header className="activity-dev-header">
        <div>
          <span className="activity-dev-eyebrow">Signals inbox</span>
          <h2>Agent and intake suggestions</h2>
        </div>
        <div className="activity-signals-actions">
          {lastSyncAt && <span className="activity-dev-pill">{formatAge(lastSyncAt)}</span>}
          <button
            type="button"
            className="activity-signals-button"
            onClick={() => void loadSignals(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {!loading && !error && (
        <div className="activity-dev-grid activity-dev-grid--metrics">
          <div className="activity-dev-metric activity-dev-tone--warning">
            <span className="activity-dev-label">Open</span>
            <strong>{items.length}</strong>
            <small>{items.length === 1 ? 'signal' : 'signals'}</small>
          </div>
          {Object.entries(groupedCounts).slice(0, 3).map(([source, count]) => (
            <div key={source} className={`activity-dev-metric activity-dev-tone--${sourceMeta(source).tone}`}>
              <span className="activity-dev-label">{sourceMeta(source).label}</span>
              <strong>{count}</strong>
              <small>open</small>
            </div>
          ))}
        </div>
      )}

      {error && <div className="activity-dev-error">{error}</div>}

      {loading ? (
        <PlaceholderRows />
      ) : items.length === 0 ? (
        <div className="activity-signals-empty">No open signals.</div>
      ) : (
        <div className="activity-signals-list">
          {items.map((item) => {
            const meta = sourceMeta(item.source);
            return (
              <article key={item.id} className={`activity-signals-row ${toneClass(item.source)}`}>
                <span className="activity-signals-source">{meta.label}</span>
                <div className="activity-signals-main">
                  <strong>{item.title}</strong>
                  {item.detail && <small>{item.detail}</small>}
                  {(item.file_ref || item.submitted_by || item.promoted_to) && (
                    <div className="activity-signals-meta">
                      {item.file_ref && <code>{item.file_ref}</code>}
                      {item.submitted_by && <span>{item.submitted_by}</span>}
                      {item.promoted_to && <span>{item.promoted_to}</span>}
                    </div>
                  )}
                </div>
                <time>{formatAge(item.created_at)}</time>
                <button
                  type="button"
                  className="activity-signals-dismiss"
                  onClick={() => void dismiss(item.id)}
                  disabled={dismissingId === item.id}
                >
                  {dismissingId === item.id ? '...' : 'Dismiss'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default SignalsInboxPanel;