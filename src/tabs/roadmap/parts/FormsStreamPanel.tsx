import React, { useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import {
  PROCESS_STREAM_KEY,
  PROCESS_STREAM_UPDATED_EVENT,
  readStoredStream,
} from '../../forms/processStreamStore';
import { ProcessStreamItem, ProcessStreamStatus, streamStatusMeta } from '../../forms/processHubData';

interface FormsStreamPanelProps {
  isDarkMode: boolean;
}

const STATUS_COLOUR: Record<ProcessStreamStatus, { light: string; dark: string }> = {
  queued: { light: colours.greyText, dark: colours.subtleGrey },
  awaiting_human: { light: colours.orange, dark: colours.orange },
  processing: { light: colours.highlight, dark: colours.accent },
  complete: { light: colours.green, dark: colours.green },
  failed: { light: colours.cta, dark: colours.cta },
};

function formatRelative(iso: string, now: number): string {
  try {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const seconds = Math.max(1, Math.floor((now - t) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

function todayCount(items: ProcessStreamItem[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return items.filter((i) => Date.parse(i.startedAt) >= startMs).length;
}

const StreamRow: React.FC<{ item: ProcessStreamItem; isDarkMode: boolean; now: number; isFresh?: boolean }> = ({ item, isDarkMode, now, isFresh }) => {
  const [hovered, setHovered] = useState(false);
  const meta = streamStatusMeta[item.status];
  const colourPair = STATUS_COLOUR[item.status];
  const statusColour = isDarkMode ? colourPair.dark : colourPair.light;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div
      data-fresh={isFresh ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 0,
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: statusColour,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: textColour,
            lineHeight: 1.4,
            letterSpacing: '-0.1px',
          }}
        >
          {item.processTitle}
        </div>
        <div
          style={{
            fontSize: 11,
            marginTop: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            color: muted,
          }}
        >
          <span>{formatRelative(item.startedAt, now)}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: statusColour,
              opacity: 0.85,
            }}
          >
            {meta.label}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: muted,
              opacity: 0.7,
            }}
          >
            {item.lane}
          </span>
        </div>
        {item.lastEvent && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              lineHeight: 1.5,
              color: muted,
            }}
          >
            {item.lastEvent}
          </div>
        )}
      </div>
    </div>
  );
};

const FormsStreamPanel: React.FC<FormsStreamPanelProps> = ({ isDarkMode }) => {
  const [items, setItems] = useState<ProcessStreamItem[]>(() => readStoredStream());
  const [now, setNow] = useState<number>(() => Date.now());
  const [statusFilter, setStatusFilter] = useState<ProcessStreamStatus | 'all'>('all');

  useEffect(() => {
    const refresh = () => setItems(readStoredStream());
    refresh();

    const onUpdate = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PROCESS_STREAM_KEY) refresh();
    };
    window.addEventListener(PROCESS_STREAM_UPDATED_EVENT, onUpdate);
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);

    return () => {
      window.removeEventListener(PROCESS_STREAM_UPDATED_EVENT, onUpdate);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, []);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    if (statusFilter === 'all') return sorted;
    return sorted.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const freshIds = useFreshIds(filtered, (item) => item.id);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: items.length, queued: 0, awaiting_human: 0, processing: 0, complete: 0, failed: 0 };
    for (const i of items) acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, [items]);

  const todays = useMemo(() => todayCount(items), [items]);
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const filterChip = (label: string, key: ProcessStreamStatus | 'all', count: number, colour: string) => {
    const active = statusFilter === key;
    return (
      <button
        key={key}
        onClick={() => setStatusFilter(active ? 'all' : key)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          borderRadius: 0,
          border: `1px solid ${active ? colour : borderColour}`,
          background: active ? `${colour}30` : 'transparent',
          color: active ? colour : muted,
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.2px',
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        {label}
        <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{count}</span>
      </button>
    );
  };

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderColour}`, borderRadius: 0, marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
              color: textColour,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Forms pipeline
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 0,
              background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
              color: muted,
              fontFamily: 'monospace',
            }}
          >
            {items.length}
          </span>
        </div>
        <span style={{ fontSize: 11, color: muted }}>
          {todays} today
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {filterChip('All', 'all', counts.all, isDarkMode ? colours.accent : colours.highlight)}
        {filterChip('Queued', 'queued', counts.queued || 0, isDarkMode ? colours.subtleGrey : colours.greyText)}
        {filterChip('Processing', 'processing', counts.processing || 0, isDarkMode ? colours.accent : colours.highlight)}
        {filterChip('Awaiting', 'awaiting_human', counts.awaiting_human || 0, colours.orange)}
        {filterChip('Complete', 'complete', counts.complete || 0, colours.green)}
        {filterChip('Failed', 'failed', counts.failed || 0, colours.cta)}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: colours.green,
            padding: '8px 0',
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <span style={{ fontSize: 11 }}>✓</span>
          Nothing in the pipeline right now
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, padding: '8px 0' }}>
          No submissions match this filter.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderLeft: `2px solid ${borderColour}`,
            paddingLeft: 16,
          }}
        >
          {filtered.slice(0, 30).map((item) => (
            <StreamRow key={item.id} item={item} isDarkMode={isDarkMode} now={now} isFresh={freshIds.has(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default FormsStreamPanel;

export function getFormsTodayCount(): number {
  return todayCount(readStoredStream());
}
