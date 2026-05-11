import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type WhiteboardStatus = 'open' | 'in_progress' | 'done' | 'parked';
type LaneId = 'thisWeek' | 'nextWeek' | 'twoWeeks' | 'later' | 'parked' | 'done';

interface WhiteboardItem {
  id: string;
  title: string;
  notes?: string;
  scheduledDate: string;
  weekStart?: string;
  manualOrder: number;
  status: WhiteboardStatus;
  briefId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface BriefLookup {
  id: string;
  title: string;
  file: string;
  status: 'open' | 'stale' | 'ready' | 'done';
}

interface RoadmapPulse {
  today: number;
  thisWeek: number;
  overdue: number;
  next7: number;
  nextWeek: number;
  twoWeeks: number;
  later: number;
  parked: number;
  doneLast14: number;
}

interface RoadmapResponse {
  today: string;
  weekStart?: string;
  items: WhiteboardItem[];
  pulse: RoadmapPulse;
  briefs: BriefLookup[];
}

interface RoadmapWhiteboardProps {
  initials: string | null;
  readOnly?: boolean;
}

interface LaneConfig {
  id: LaneId;
  title: string;
  defaultWeekStart: (today: string) => string;
  defaultDate: (today: string) => string;
  defaultStatus: WhiteboardStatus;
}

const ORDER_GAP = 1024;
const DAILY_BREAKDOWN_STORAGE_KEY = 'helix.forge.whiteboard.dailyBreakdown';

const LANES: LaneConfig[] = [
  { id: 'thisWeek', title: 'This week', defaultWeekStart: startOfWeek, defaultDate: (today) => today, defaultStatus: 'open' },
  { id: 'nextWeek', title: 'Next week', defaultWeekStart: (today) => addWeeks(startOfWeek(today), 1), defaultDate: (today) => addWeeks(startOfWeek(today), 1), defaultStatus: 'open' },
  { id: 'twoWeeks', title: 'Two weeks out', defaultWeekStart: (today) => addWeeks(startOfWeek(today), 2), defaultDate: (today) => addWeeks(startOfWeek(today), 2), defaultStatus: 'open' },
  { id: 'later', title: 'Later', defaultWeekStart: (today) => addWeeks(startOfWeek(today), 3), defaultDate: (today) => addWeeks(startOfWeek(today), 3), defaultStatus: 'open' },
  { id: 'parked', title: 'Parked', defaultWeekStart: () => 'parked', defaultDate: () => 'parked', defaultStatus: 'parked' },
  { id: 'done', title: 'Done', defaultWeekStart: startOfWeek, defaultDate: (today) => today, defaultStatus: 'done' },
];

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addWeeks(value: string, weeks: number): string {
  return addDays(value, weeks * 7);
}

function startOfWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return fallbackToday();
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function fallbackToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function classifyItem(item: WhiteboardItem, currentWeekStart: string): LaneId {
  if (item.status === 'done') return 'done';
  if (item.status === 'parked' || item.scheduledDate === 'parked') return 'parked';
  const itemWeekStart = item.weekStart && item.weekStart !== 'parked' ? item.weekStart : startOfWeek(item.scheduledDate);
  if (itemWeekStart <= currentWeekStart) return 'thisWeek';
  if (itemWeekStart === addWeeks(currentWeekStart, 1)) return 'nextWeek';
  if (itemWeekStart === addWeeks(currentWeekStart, 2)) return 'twoWeeks';
  return 'later';
}

function sortItems(items: WhiteboardItem[]): WhiteboardItem[] {
  return [...items].sort((a, b) => {
    if (a.manualOrder !== b.manualOrder) return a.manualOrder - b.manualOrder;
    const weekCompare = (a.weekStart || '').localeCompare(b.weekStart || '');
    if (weekCompare !== 0) return weekCompare;
    return a.scheduledDate.localeCompare(b.scheduledDate);
  });
}

function orderBetween(previous?: WhiteboardItem, next?: WhiteboardItem): number {
  if (previous && next) return (previous.manualOrder + next.manualOrder) / 2;
  if (previous) return previous.manualOrder + ORDER_GAP;
  if (next) return next.manualOrder - ORDER_GAP;
  return ORDER_GAP;
}

function statusLabel(status: WhiteboardStatus): string {
  if (status === 'in_progress') return 'In progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string): string {
  if (value === 'parked') return 'Parked';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatWeek(value: string): string {
  if (value === 'parked') return 'Parked';
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return value;
  const endValue = addDays(value, 4);
  const end = new Date(`${endValue}T00:00:00`);
  return `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
}

function initialDailyBreakdown(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DAILY_BREAKDOWN_STORAGE_KEY) === '1';
}

const RoadmapWhiteboard: React.FC<RoadmapWhiteboardProps> = ({ initials, readOnly = false }) => {
  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const [briefs, setBriefs] = useState<Record<string, BriefLookup>>({});
  const [today, setToday] = useState(fallbackToday());
  const [weekStart, setWeekStart] = useState(startOfWeek(fallbackToday()));
  const [pulse, setPulse] = useState<RoadmapPulse>({ today: 0, thisWeek: 0, overdue: 0, next7: 0, nextWeek: 0, twoWeeks: 0, later: 0, parked: 0, doneLast14: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [dailyBreakdown, setDailyBreakdown] = useState(initialDailyBreakdown);

  const auth = useMemo(() => (initials ? `?initials=${encodeURIComponent(initials)}` : ''), [initials]);
  const authHeaders = useMemo((): Record<string, string> => (initials ? { 'x-user-initials': initials } : {}), [initials]);

  const loadRoadmap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dev-console/roadmap${auth}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Roadmap HTTP ${res.status}`);
      const json = (await res.json()) as RoadmapResponse;
      setItems(json.items || []);
      setToday(json.today || fallbackToday());
      setWeekStart(json.weekStart || startOfWeek(json.today || fallbackToday()));
      setPulse(json.pulse || { today: 0, thisWeek: 0, overdue: 0, next7: 0, nextWeek: 0, twoWeeks: 0, later: 0, parked: 0, doneLast14: 0 });
      setBriefs(Object.fromEntries((json.briefs || []).map((brief) => [brief.id, brief])));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadmap whiteboard');
    } finally {
      setLoading(false);
    }
  }, [auth, authHeaders]);

  useEffect(() => {
    void loadRoadmap();
  }, [loadRoadmap]);

  useEffect(() => {
    window.localStorage.setItem(DAILY_BREAKDOWN_STORAGE_KEY, dailyBreakdown ? '1' : '0');
  }, [dailyBreakdown]);

  const lanes = useMemo(() => {
    const grouped: Record<LaneId, WhiteboardItem[]> = {
      thisWeek: [],
      nextWeek: [],
      twoWeeks: [],
      later: [],
      parked: [],
      done: [],
    };
    items.forEach((item) => grouped[classifyItem(item, weekStart)].push(item));
    return Object.fromEntries(Object.entries(grouped).map(([laneId, laneItems]) => [laneId, sortItems(laneItems)])) as Record<LaneId, WhiteboardItem[]>;
  }, [items, weekStart]);

  const thisWeekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const thisWeekDailyItems = useMemo(() => Object.fromEntries(thisWeekDays.map((day) => [
    day,
    sortItems(lanes.thisWeek.filter((item) => item.scheduledDate === day)),
  ])) as Record<string, WhiteboardItem[]>, [lanes.thisWeek, thisWeekDays]);
  const thisWeekOtherItems = useMemo(() => sortItems(lanes.thisWeek.filter((item) => !thisWeekDays.includes(item.scheduledDate))), [lanes.thisWeek, thisWeekDays]);

  const patchItem = useCallback(async (id: string, patch: Partial<WhiteboardItem>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dev-console/roadmap/${encodeURIComponent(id)}${auth}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Roadmap update HTTP ${res.status}`);
      const json = (await res.json()) as { item: WhiteboardItem };
      setItems((current) => current.map((item) => (item.id === id ? json.item : item)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roadmap item');
      await loadRoadmap();
    } finally {
      setSaving(false);
    }
  }, [auth, authHeaders, loadRoadmap]);

  const createItem = useCallback(async (title: string, laneId: LaneId = 'thisWeek') => {
    const lane = LANES.find((entry) => entry.id === laneId) || LANES[0];
    const nextScheduledDate = lane.defaultDate(today);
    const nextWeekStart = lane.defaultWeekStart(today);
    setSaving(true);
    try {
      const res = await fetch(`/api/dev-console/roadmap${auth}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scheduledDate: nextScheduledDate, weekStart: nextWeekStart, status: lane.defaultStatus }),
      });
      if (!res.ok) throw new Error(`Roadmap create HTTP ${res.status}`);
      const json = (await res.json()) as { item: WhiteboardItem };
      setItems((current) => [...current, json.item]);
      setDraftTitle('');
      setError(null);
      await loadRoadmap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create roadmap item');
    } finally {
      setSaving(false);
    }
  }, [auth, authHeaders, loadRoadmap, today]);

  const deleteItem = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dev-console/roadmap/${encodeURIComponent(id)}${auth}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`Roadmap delete HTTP ${res.status}`);
      setItems((current) => current.filter((item) => item.id !== id));
      setError(null);
      await loadRoadmap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to park roadmap item');
    } finally {
      setSaving(false);
    }
  }, [auth, authHeaders, loadRoadmap]);

  const handleQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    void createItem(title, 'thisWeek');
  };

  const startEditing = (item: WhiteboardItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const saveTitle = (item: WhiteboardItem) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (title && title !== item.title) void patchItem(item.id, { title });
  };

  const toggleNotes = (item: WhiteboardItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setNotesDraft(item.notes || '');
  };

  const saveNotes = (item: WhiteboardItem) => {
    void patchItem(item.id, { notes: notesDraft });
  };

  const moveBefore = (target: WhiteboardItem) => {
    if (!draggingId || draggingId === target.id) return;
    const dragged = items.find((item) => item.id === draggingId);
    if (!dragged) return;
    const targetLane = classifyItem(target, weekStart);
    const targetItems = lanes[targetLane].filter((item) => item.id !== draggingId);
    const targetIndex = targetItems.findIndex((item) => item.id === target.id);
    const previous = targetIndex > 0 ? targetItems[targetIndex - 1] : undefined;
    const order = orderBetween(previous, target);
    const patch: Partial<WhiteboardItem> = {
      scheduledDate: target.scheduledDate,
      weekStart: target.weekStart || startOfWeek(target.scheduledDate),
      status: target.status === 'done' ? 'done' : targetLane === 'parked' ? 'parked' : dragged.status === 'done' || dragged.status === 'parked' ? 'open' : dragged.status,
      manualOrder: order,
    };
    void patchItem(draggingId, patch);
  };

  const moveToLaneTail = (lane: LaneConfig) => {
    if (!draggingId) return;
    const laneItems = lanes[lane.id].filter((item) => item.id !== draggingId);
    const previous = laneItems[laneItems.length - 1];
    const nextScheduledDate = lane.defaultDate(today);
    const nextWeekStart = lane.defaultWeekStart(today);
    void patchItem(draggingId, {
      scheduledDate: nextScheduledDate,
      weekStart: nextWeekStart,
      status: lane.defaultStatus,
      manualOrder: orderBetween(previous, undefined),
    });
  };

  const moveToDayTail = (day: string) => {
    if (!draggingId) return;
    const laneItems = thisWeekDailyItems[day].filter((item) => item.id !== draggingId);
    const previous = laneItems[laneItems.length - 1];
    void patchItem(draggingId, {
      scheduledDate: day,
      weekStart: startOfWeek(day),
      status: 'open',
      manualOrder: orderBetween(previous, undefined),
    });
  };

  const renderItem = (item: WhiteboardItem) => {
    const brief = item.briefId ? briefs[item.briefId] : undefined;
    return (
      <article
        key={item.id}
        className={`activity-whiteboard-card activity-whiteboard-card--${item.status}${draggingId === item.id ? ' activity-whiteboard-card--dragging' : ''}${readOnly ? ' activity-whiteboard-card--readonly' : ''}`}
        draggable={!readOnly}
        onDragStart={readOnly ? undefined : () => setDraggingId(item.id)}
        onDragEnd={readOnly ? undefined : () => setDraggingId(null)}
        onDragOver={readOnly ? undefined : (event) => event.preventDefault()}
        onDrop={readOnly ? undefined : (event) => {
          event.preventDefault();
          moveBefore(item);
          setDraggingId(null);
        }}
      >
        <div className="activity-whiteboard-card-main">
          {!readOnly && editingId === item.id ? (
            <input
              className="activity-whiteboard-title-input"
              value={editingTitle}
              autoFocus
              maxLength={140}
              onChange={(event) => setEditingTitle(event.target.value)}
              onBlur={() => saveTitle(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTitle(item);
                if (event.key === 'Escape') setEditingId(null);
              }}
            />
          ) : (
            <strong>{item.title}</strong>
          )}
          <div className="activity-whiteboard-meta">
            <span>{formatWeek(item.weekStart || startOfWeek(item.scheduledDate))}</span>
            <span>{formatDate(item.scheduledDate)}</span>
            <span>{statusLabel(item.status)}</span>
            {brief && <span>{brief.status}</span>}
            {item.briefId && !brief && <span>{item.briefId}</span>}
          </div>
        </div>

        {!readOnly && <div className="activity-whiteboard-controls">
          <input
            className="activity-whiteboard-date"
            type="date"
            value={item.scheduledDate === 'parked' ? '' : item.scheduledDate}
            disabled={item.status === 'parked'}
            onChange={(event) => void patchItem(item.id, { scheduledDate: event.target.value, weekStart: startOfWeek(event.target.value), status: item.status === 'parked' ? 'open' : item.status })}
            aria-label={`Schedule ${item.title}`}
          />
          <select
            className="activity-whiteboard-select"
            value={item.status}
            onChange={(event) => {
              const nextStatus = event.target.value as WhiteboardStatus;
              const nextScheduledDate = item.scheduledDate === 'parked' ? today : item.scheduledDate;
              void patchItem(item.id, nextStatus === 'parked'
                ? { status: 'parked', scheduledDate: 'parked', weekStart: 'parked' }
                : { status: nextStatus, scheduledDate: nextScheduledDate, weekStart: startOfWeek(nextScheduledDate) });
            }}
            aria-label={`Status for ${item.title}`}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="parked">Parked</option>
          </select>
          <button type="button" onClick={() => startEditing(item)}>Edit</button>
          <button type="button" onClick={() => toggleNotes(item)}>{expandedId === item.id ? 'Close' : 'Notes'}</button>
          {item.status === 'parked' ? (
            <button type="button" onClick={() => void patchItem(item.id, { scheduledDate: today, weekStart, status: 'open' })}>This week</button>
          ) : (
            <button type="button" onClick={() => void patchItem(item.id, { scheduledDate: 'parked', weekStart: 'parked', status: 'parked' })}>Park</button>
          )}
          <button type="button" onClick={() => void deleteItem(item.id)}>Remove</button>
        </div>}

        {!readOnly && expandedId === item.id && (

          <div className="activity-whiteboard-notes">
            {brief && <small>{brief.title}</small>}
            <textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="Notes"
              rows={4}
            />
            <button type="button" onClick={() => saveNotes(item)}>Save notes</button>
          </div>
        )}
      </article>
    );
  };

  const renderLaneContent = (lane: LaneConfig) => {
    if (lane.id !== 'thisWeek' || !dailyBreakdown) {
      return (
        <div className="activity-whiteboard-lane-list">
          {lanes[lane.id].length ? lanes[lane.id].map(renderItem) : <p>Nothing here.</p>}
        </div>
      );
    }

    return (
      <div className="activity-whiteboard-day-grid">
        {thisWeekDays.map((day) => (
          <section
            key={day}
            className="activity-whiteboard-day-lane"
            onDragOver={readOnly ? undefined : (event) => event.preventDefault()}
            onDrop={readOnly ? undefined : (event) => {
              event.preventDefault();
              moveToDayTail(day);
              setDraggingId(null);
            }}
          >
            <div className="activity-whiteboard-day-head">
              <span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              <small>{formatDate(day)}</small>
            </div>
            <div className="activity-whiteboard-lane-list">
              {thisWeekDailyItems[day].length ? thisWeekDailyItems[day].map(renderItem) : <p>Nothing.</p>}
            </div>
          </section>
        ))}
        {thisWeekOtherItems.length > 0 && (
          <section className="activity-whiteboard-day-lane activity-whiteboard-day-lane--other">
            <div className="activity-whiteboard-day-head">
              <span>Other</span>
              <small>{thisWeekOtherItems.length}</small>
            </div>
            <div className="activity-whiteboard-lane-list">
              {thisWeekOtherItems.map(renderItem)}
            </div>
          </section>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <section className="activity-whiteboard" data-helix-region="system/forge/whiteboard">
        <div className="activity-whiteboard-head">
          <div>
            <span className="activity-dev-eyebrow">Roadmap whiteboard</span>
            <h3>Loading the weekly cut</h3>
          </div>
          <span className="activity-dev-pill">...</span>
        </div>
        <div className="activity-whiteboard-skeleton" />
      </section>
    );
  }

  return (
    <section className="activity-whiteboard" data-helix-region="system/forge/whiteboard">
      <div className="activity-whiteboard-head">
        <div>
          <span className="activity-dev-eyebrow">Roadmap whiteboard</span>
          <h3>Weekly control room</h3>
        </div>
        <div className="activity-whiteboard-head-actions">
          <button
            type="button"
            className="activity-whiteboard-breakdown-toggle"
            aria-pressed={dailyBreakdown}
            onClick={() => setDailyBreakdown((value) => !value)}
          >
            Daily breakdown
          </button>
          <span className="activity-dev-pill">{pulse.thisWeek} this week / {pulse.overdue} older / {pulse.nextWeek} next</span>
        </div>
      </div>

      {!readOnly && (
        <form className="activity-whiteboard-quickadd" onSubmit={handleQuickAdd}>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Patch a roadmap item into this week"
            maxLength={140}
          />
          <button type="submit" disabled={saving || !draftTitle.trim()}>Add</button>
        </form>
      )}

      {error && <div className="activity-whiteboard-error">{error}</div>}

      <div className="activity-whiteboard-lanes">
        {LANES.filter((lane) => lane.id !== 'done' || showDone).map((lane) => (
          <section
            key={lane.id}
            className={`activity-whiteboard-lane activity-whiteboard-lane--${lane.id}`}
            onDragOver={readOnly ? undefined : (event) => event.preventDefault()}
            onDrop={readOnly ? undefined : (event) => {
              event.preventDefault();
              moveToLaneTail(lane);
              setDraggingId(null);
            }}
          >
            <div className="activity-whiteboard-lane-head">
              <h4>{lane.title}</h4>
              <span>{lanes[lane.id].length}</span>
            </div>
            {renderLaneContent(lane)}
          </section>
        ))}
        {!showDone && (
          <button type="button" className="activity-whiteboard-done-toggle" onClick={() => setShowDone(true)}>
            Show done ({lanes.done.length})
          </button>
        )}
      </div>
    </section>
  );
};

export default RoadmapWhiteboard;