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

export type UnifiedSource = 'forms' | 'activity' | 'cards' | 'matters';

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
  cards: 'Card',
  matters: 'Matter',
};

const CARD_ACTIVITY_SOURCES = new Set<ActivityFeedItem['source']>([
  'teams.card',
  'activity.cardlab',
  'activity.card.send',
  'activity.dm.send',
]);

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

function clockTime(ts: number): string {
  if (!ts) return '-';
  const date = new Date(ts);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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
      sourceLabel: `${SOURCE_LABEL.forms} - ${item.lane}`,
      title: item.processTitle,
      detail: item.lastEvent || meta.label,
      status,
      ts: safeParse(item.startedAt),
    };
  });
}

function fromActivity(items: ActivityFeedItem[]): UnifiedEvent[] {
  return items.map((item) => {
    const source: UnifiedSource = CARD_ACTIVITY_SOURCES.has(item.source) ? 'cards' : 'activity';
    return {
      id: `activity:${item.id}`,
      source,
      sourceLabel: `${SOURCE_LABEL[source]} - ${item.sourceLabel}`,
      title: item.title,
      detail: item.summary,
      status: item.status === 'success' || item.status === 'error' || item.status === 'active' || item.status === 'info'
        ? item.status
        : 'info',
      ts: safeParse(item.timestamp),
      link: item.teamsLink,
    };
  });
}

const SourceTag: React.FC<{ source: UnifiedSource; isDarkMode: boolean }> = ({ source, isDarkMode }) => {
  const tone = source === 'forms'
    ? (isDarkMode ? colours.accent : colours.highlight)
    : source === 'cards'
      ? colours.orange
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

const LedgerRow: React.FC<{ event: UnifiedEvent; isDarkMode: boolean; now: number; isFresh?: boolean; compact?: boolean }> = ({ event, isDarkMode, now, isFresh, compact }) => {
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

  const handleKeyDown = (eventInfo: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.link) return;
    if (eventInfo.key === 'Enter' || eventInfo.key === ' ') {
      eventInfo.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      data-fresh={isFresh ? 'true' : undefined}
      role={event.link ? 'button' : undefined}
      tabIndex={event.link ? 0 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={event.link ? handleClick : undefined}
      onKeyDown={event.link ? handleKeyDown : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '52px minmax(0, 1fr) 42px' : '54px 74px 74px minmax(160px, 1.2fr) minmax(190px, 1fr) 46px',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? '7px 10px' : '7px 12px',
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)') : 'transparent',
        cursor: event.link ? 'pointer' : 'default',
        transition: 'background 0.12s',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
        minHeight: compact ? 38 : 42,
      }}
    >
      <span style={{ fontSize: 11, color: muted, fontFamily: 'monospace' }}>{clockTime(event.ts)}</span>
      {!compact && <SourceTag source={event.source} isDarkMode={isDarkMode} />}
      {!compact && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 800,
            color: statusColour,
            fontFamily: 'monospace',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColour, flexShrink: 0 }} />
          {event.status}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: 600,
            color: textColour,
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
              fontSize: compact ? 10 : 11,
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
      {!compact && (
        <div style={{ minWidth: 0, fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.sourceLabel}
        </div>
      )}
      <span style={{ fontSize: 10, color: event.link ? (isDarkMode ? colours.accent : colours.highlight) : muted, fontFamily: 'monospace', textAlign: 'right' }}>
        {event.link ? 'open' : relTime(event.ts, now)}
      </span>
    </div>
  );
};

const LedgerTable: React.FC<{
  title: string;
  events: UnifiedEvent[];
  isDarkMode: boolean;
  now: number;
  freshIds: Set<string>;
  compact?: boolean;
  emptyText: string;
  region: string;
}> = ({ title, events, isDarkMode, now, freshIds, compact, emptyText, region }) => {
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <section data-helix-region={region} style={{ minWidth: 0, border: `1px solid ${borderCol}`, borderRadius: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: compact ? '8px 10px' : '9px 12px',
          borderBottom: `1px solid ${borderCol}`,
          background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: textColour, fontFamily: 'Raleway, sans-serif' }}>
          {title}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: muted, fontFamily: 'monospace' }}>{events.length}</span>
      </div>

      {!compact && events.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateColumns: '54px 74px 74px minmax(160px, 1.2fr) minmax(190px, 1fr) 46px',
            gap: 10,
            padding: '6px 12px',
            borderBottom: `1px solid ${borderCol}`,
            fontSize: 9,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: muted,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <span>Time</span>
          <span>Type</span>
          <span>Status</span>
          <span>Subject</span>
          <span>Detail</span>
          <span style={{ textAlign: 'right' }}>Link</span>
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ padding: compact ? '18px 10px' : '24px 12px', textAlign: 'center', fontSize: 12, color: muted, fontFamily: 'Raleway, sans-serif' }}>
          {emptyText}
        </div>
      ) : (
        <div className="system-activity-scroll" style={{ maxHeight: compact ? 430 : 560, overflowY: 'auto' }}>
          {events.map((event) => (
            <LedgerRow key={event.id} event={event} isDarkMode={isDarkMode} now={now} isFresh={freshIds.has(event.id)} compact={compact} />
          ))}
        </div>
      )}
    </section>
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

  const cardEvents = useMemo(() => {
    return events.filter((event) => event.source === 'cards').slice(0, 16);
  }, [events]);

  const freshIds = useFreshIds(events, (event) => event.id);

  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const heading = title || (filterSource ? `${SOURCE_LABEL[filterSource]} stream` : 'Live stream');

  return (
    <div data-helix-region="roadmap/activity-ledger" style={{ background: bg, border: `1px solid ${borderCol}`, borderRadius: 0 }}>
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
        {!filterSource && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              background: `${colours.orange}20`,
              color: colours.orange,
              fontFamily: 'monospace',
            }}
          >
            cards {cardEvents.length}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: !filterSource ? 'minmax(360px, 1.5fr) minmax(280px, 0.8fr)' : '1fr',
          gap: 10,
          padding: 10,
        }}
      >
        <LedgerTable
          title={filterSource ? heading : 'All activity ledger'}
          events={events}
          isDarkMode={isDarkMode}
          now={now}
          freshIds={freshIds}
          emptyText="Nothing here yet. Events will appear in real time."
          region="roadmap/activity-ledger/all"
        />
        {!filterSource && (
          <LedgerTable
            title="Card tracking"
            events={cardEvents}
            isDarkMode={isDarkMode}
            now={now}
            freshIds={freshIds}
            compact
            emptyText="No tracked card activity in this window."
            region="roadmap/activity-ledger/cards"
          />
        )}
      </div>
    </div>
  );
};

export default UnifiedStream;
