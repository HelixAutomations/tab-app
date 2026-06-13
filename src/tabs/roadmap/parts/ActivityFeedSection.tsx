import React, { useCallback, useMemo, useState } from 'react';
import { app } from '@microsoft/teams-js';
import DataFreshnessIndicator from '../../../components/DataFreshnessIndicator';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import { ActivityFeedItem, FeedStatus } from './types';

interface ActivityFeedSectionProps {
  items: ActivityFeedItem[];
  isDarkMode: boolean;
  isRefreshing: boolean;
  isSnapshot: boolean;
  lastLiveSyncAt: number | null;
  error: string | null;
}

const FEED_STATUS_META: Record<FeedStatus, { label: string; colour: string; darkColour: string }> = {
  success: { label: 'Processed', colour: colours.green, darkColour: colours.green },
  error: { label: 'Failed', colour: colours.cta, darkColour: colours.cta },
  active: { label: 'Active', colour: colours.highlight, darkColour: colours.accent },
  info: { label: 'Observed', colour: colours.greyText, darkColour: colours.subtleGrey },
};

const CARD_ACTIVITY_SOURCES = new Set<ActivityFeedItem['source']>([
  'teams.card',
  'activity.cardlab',
  'activity.card.send',
  'activity.dm.send',
]);

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatLedgerTime(iso: string): string {
  try {
    const date = new Date(iso);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '-';
  }
}

const ActivityFeedRow: React.FC<{ item: ActivityFeedItem; isDarkMode: boolean; isFresh?: boolean; compact?: boolean }> = ({ item, isDarkMode, isFresh, compact }) => {
  const [hovered, setHovered] = useState(false);
  const statusMeta = FEED_STATUS_META[item.status];
  const statusColour = isDarkMode ? statusMeta.darkColour : statusMeta.colour;

  const handleOpenTeams = useCallback(async () => {
    if (!item.teamsLink) return;

    try {
      await app.openLink(item.teamsLink);
    } catch {
      window.open(item.teamsLink, '_blank', 'noopener,noreferrer');
    }
  }, [item.teamsLink]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!item.teamsLink) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void handleOpenTeams();
    }
  }, [handleOpenTeams, item.teamsLink]);

  return (
    <div
      data-fresh={isFresh ? 'true' : undefined}
      role={item.teamsLink ? 'button' : undefined}
      tabIndex={item.teamsLink ? 0 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={item.teamsLink ? handleOpenTeams : undefined}
      onKeyDown={item.teamsLink ? handleKeyDown : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '52px minmax(0, 1fr) 42px' : '54px 116px 74px minmax(150px, 1.1fr) minmax(180px, 1fr) 46px',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        minHeight: compact ? 38 : 42,
        padding: compact ? '7px 10px' : '7px 12px',
        borderRadius: 0,
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
        transition: 'background 0.12s',
        cursor: item.teamsLink ? 'pointer' : 'default',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
      }}
    >
      <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'monospace' }}>
        {formatLedgerTime(item.timestamp)}
      </span>
      {!compact && (
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: statusColour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.sourceLabel}
        </span>
      )}
      {!compact && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: statusColour, fontFamily: 'monospace', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColour, flexShrink: 0 }} />
          {statusMeta.label}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: 600,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        {compact && item.summary && (
          <div style={{ marginTop: 2, fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.summary}
          </div>
        )}
      </div>
      {!compact && (
        <div style={{ minWidth: 0, fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.summary || formatDateTime(item.timestamp)}
        </div>
      )}
      <span style={{ fontSize: 10, color: item.teamsLink ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? colours.subtleGrey : colours.greyText), fontFamily: 'monospace', textAlign: 'right' }}>
        {item.teamsLink ? 'open' : ''}
      </span>
    </div>
  );
};

const LedgerPanel: React.FC<{
  title: string;
  items: ActivityFeedItem[];
  isDarkMode: boolean;
  freshIds: Set<string>;
  compact?: boolean;
  emptyText: string;
  region: string;
}> = ({ title, items, isDarkMode, freshIds, compact, emptyText, region }) => {
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <section data-helix-region={region} style={{ minWidth: 0, border: `1px solid ${borderColour}`, borderRadius: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '8px 10px' : '9px 12px', borderBottom: `1px solid ${borderColour}`, background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)' }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          {title}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: muted, fontFamily: 'monospace' }}>{items.length}</span>
      </div>

      {!compact && items.length > 0 && (
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '54px 116px 74px minmax(150px, 1.1fr) minmax(180px, 1fr) 46px', gap: 10, padding: '6px 12px', borderBottom: `1px solid ${borderColour}`, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: muted, fontFamily: 'Raleway, sans-serif' }}>
          <span>Time</span>
          <span>Source</span>
          <span>Status</span>
          <span>Subject</span>
          <span>Detail</span>
          <span style={{ textAlign: 'right' }}>Link</span>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ padding: compact ? '18px 10px' : '24px 12px', textAlign: 'center', fontSize: 12, color: muted, fontFamily: 'Raleway, sans-serif' }}>
          {emptyText}
        </div>
      ) : (
        <div className="system-activity-scroll" style={{ maxHeight: compact ? 430 : 560, overflowY: 'auto' }}>
          {items.map((item) => (
            <ActivityFeedRow key={item.id} item={item} isDarkMode={isDarkMode} isFresh={freshIds.has(item.id)} compact={compact} />
          ))}
        </div>
      )}
    </section>
  );
};

const ActivityFeedSection: React.FC<ActivityFeedSectionProps> = ({
  items,
  isDarkMode,
  isRefreshing,
  isSnapshot,
  lastLiveSyncAt,
  error,
}) => {
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const freshIds = useFreshIds(items, (item) => item.id);
  const cardItems = useMemo(() => items.filter((item) => CARD_ACTIVITY_SOURCES.has(item.source)).slice(0, 16), [items]);

  return (
    <div data-helix-region="roadmap/activity-feed-ledger" style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderColour}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
            Operations ledger
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'monospace' }}>
            {items.length}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: `${colours.orange}20`, color: colours.orange, fontFamily: 'monospace' }}>
            cards {cardItems.length}
          </span>
        </div>
        <DataFreshnessIndicator
          label="Activity"
          isRefreshing={isRefreshing}
          isSnapshot={isSnapshot}
          lastLiveSyncAt={lastLiveSyncAt}
          errorDetail={items.length > 0 ? error : null}
          snapshotLabel="Delayed"
          compact
        />
      </div>

      {error ? (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: colours.cta, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colours.green, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          <span style={{ fontSize: 11 }}>✓</span>
          All clear - no recent activity
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 1.5fr) minmax(280px, 0.8fr)',
            gap: 10,
          }}
        >
          <LedgerPanel
            title="All activity"
            items={items}
            isDarkMode={isDarkMode}
            freshIds={freshIds}
            emptyText="No recent activity."
            region="roadmap/activity-feed-ledger/all"
          />
          <LedgerPanel
            title="Card tracking"
            items={cardItems}
            isDarkMode={isDarkMode}
            freshIds={freshIds}
            compact
            emptyText="No tracked card activity in this window."
            region="roadmap/activity-feed-ledger/cards"
          />
        </div>
      )}
    </div>
  );
};

export default ActivityFeedSection;