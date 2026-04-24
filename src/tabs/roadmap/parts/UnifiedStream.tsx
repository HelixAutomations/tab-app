// src/tabs/roadmap/parts/UnifiedStream.tsx — merged event stream (forms + activity feed)
//
// Renders a single chronological table of platform events from multiple sources.
// Used by the Activity tab focal surface as the "All" lens.

import React, { useEffect, useMemo, useState } from 'react';
import { app } from '@microsoft/teams-js';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import {
  PROCESS_STREAM_KEY,
  PROCESS_STREAM_UPDATED_EVENT,
  readStoredStream,
} from '../../forms/processStreamStore';
import { ProcessStreamItem, streamStatusMeta } from '../../forms/processHubData';
import type { ActivityFeedItem } from './types';

export type UnifiedSource = 'forms' | 'activity' | 'matters';

export interface UnifiedEvent {
  id: string;
  source: UnifiedSource;
  sourceLabel: string;
  title: string;
  detail?: string;
  status: 'success' | 'error' | 'active' | 'info' | 'warning';
  ts: number; // epoch ms
  link?: string | null;
}

interface UnifiedStreamProps {
  isDarkMode: boolean;
  activityItems: ActivityFeedItem[];
  /** Optional source filter — when set, only show events from this source */
  filterSource?: UnifiedSource;
  /** Hard cap on rows */
  limit?: number;
  /** Title shown in the panel header */
  title?: string;
}

const STATUS_COLOUR: Record<UnifiedEvent['status'], { light: string; dark: string }> = {
  success: { light: colours.green, dark: colours.green },
  error: { light: colours.cta, dark: colours.cta },
  active: { light: colours.highlight, dark: colours.accent },
  warning: { light: colours.orange, dark: colours.orange },
  info: { light: colours.greyText, dark: colours.subtleGrey },
};

const SOURCE_LABEL: Record<UnifiedSource, string> = {
  forms: 'Form',
  activity: 'Activity',
  matters: 'Matter',
};

function safeParse(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function relTime(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formForms(items: ProcessStreamItem[]): UnifiedEvent[] {
  return items.map((item) => {
    const meta = streamStatusMeta[item.status];
    const status: UnifiedEvent['status'] = item.status === 'failed'
      ? 'error'
      : item.status === 'complete'
        ? 'success'
        : item.status === 'awaiting_human'
          ? 'warning'
          : item.status === 'processing'
            ? 'active'
            : 'info';
    return {
      id: `forms:${item.id}`,
      source: 'forms',
      sourceLabel: `${SOURCE_LABEL.forms} · ${item.lane}`,
      title: item.processTitle,
      detail: item.lastEvent || meta.label,
      status,
      ts: safeParse(item.startedAt),
    };
  });
}

function fromActivity(items: ActivityFeedItem[]): UnifiedEvent[] {
  return items.map((item) => ({
    id: `activity:${item.id}`,
    source: 'activity',
    sourceLabel: `${SOURCE_LABEL.activity} · ${item.sourceLabel}`,
    title: item.title,
    detail: item.summary,
    status: item.status === 'success' || item.status === 'error' || item.status === 'active' || item.status === 'info'
      ? item.status
      : 'info',
    ts: safeParse(item.timestamp),
    link: item.teamsLink,
  }));
}

const SourceTag: React.FC<{ source: UnifiedSource; isDarkMode: boolean }> = ({ source, isDarkMode }) => {
  const tone = source === 'forms'
    ? (isDarkMode ? colours.accent : colours.highlight)
    : source === 'matters'
      ? colours.green
      : (isDarkMode ? colours.subtleGrey : colours.greyText);
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        padding: '2px 6px',
        background: `${tone}1A`,
        color: tone,
        fontFamily: 'monospace',
      }}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
};

const Row: React.FC<{ event: UnifiedEvent; isDarkMode: boolean; now: number; isFresh?: boolean }> = ({ event, isDarkMode, now, isFresh }) => {
  const [hovered, setHovered] = useState(false);
  const statusPair = STATUS_COLOUR[event.status];
  const statusColour = isDarkMode ? statusPair.dark : statusPair.light;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const handleClick = async () => {
    if (!event.link) return;
    try {
      await app.openLink(event.link);
    } catch {
      window.open(event.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      data-fresh={isFresh ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={event.link ? handleClick : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 64px 1fr 60px',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)') : 'transparent',
        cursor: event.link ? 'pointer' : 'default',
        transition: 'background 0.12s',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 999, background: statusColour, flexShrink: 0 }} />
      <SourceTag source={event.source} isDarkMode={isDarkMode} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: textColour,
            letterSpacing: '-0.1px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.title}
        </div>
        {event.detail && (
          <div
            style={{
              fontSize: 11,
              color: muted,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {event.detail}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          color: muted,
          fontFamily: 'monospace',
          textAlign: 'right',
        }}
      >
        {event.ts ? relTime(event.ts, now) : '—'}
      </span>
    </div>
  );
};

const UnifiedStream: React.FC<UnifiedStreamProps> = ({
  isDarkMode,
  activityItems,
  filterSource,
  limit = 80,
  title,
}) => {
  const [forms, setForms] = useState<ProcessStreamItem[]>(() => readStoredStream());
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const refresh = () => setForms(readStoredStream());
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

  const events = useMemo(() => {
    const merged = [...formForms(forms), ...fromActivity(activityItems)];
    const filtered = filterSource ? merged.filter((e) => e.source === filterSource) : merged;
    return filtered.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }, [forms, activityItems, filterSource, limit]);

  const freshIds = useFreshIds(events, (event) => event.id);

  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const heading = title || (filterSource ? `${SOURCE_LABEL[filterSource]} stream` : 'Live stream');

  return (
    <div style={{ background: bg, border: `1px solid ${borderCol}`, borderRadius: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: textColour,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          {heading}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
            color: muted,
            fontFamily: 'monospace',
          }}
        >
          {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            fontSize: 12,
            color: muted,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          Nothing here yet — events will appear in real time.
        </div>
      ) : (
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {events.map((event) => (
            <Row key={event.id} event={event} isDarkMode={isDarkMode} now={now} isFresh={freshIds.has(event.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default UnifiedStream;
