import React, { useCallback, useState } from 'react';
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

const ActivityFeedRow: React.FC<{ item: ActivityFeedItem; isDarkMode: boolean; isFresh?: boolean }> = ({ item, isDarkMode, isFresh }) => {
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

  return (
    <div
      data-fresh={isFresh ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 14px', borderRadius: 0,
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 13, fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              lineHeight: 1.4, letterSpacing: '-0.1px',
            }}
          >
            {item.title}
          </div>
          {item.teamsLink && (
            <button
              type="button"
              onClick={handleOpenTeams}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDarkMode ? colours.accent : colours.highlight,
                textDecoration: 'none',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Open in Teams
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 11, marginTop: 3,
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap',
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
          }}
        >
          <span>{formatDateTime(item.timestamp)}</span>
          <span
            style={{
              fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.4px', color: statusColour, opacity: 0.85,
            }}
          >
            {item.sourceLabel}
          </span>
          <span
            style={{
              fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.4px', color: statusColour, opacity: 0.7,
            }}
          >
            {statusMeta.label}
          </span>
        </div>
        {item.summary && (
          <div
            style={{
              marginTop: 8, fontSize: 12, lineHeight: 1.5,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
            }}
          >
            {item.summary}
          </div>
        )}
      </div>
    </div>
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

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderColour}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
            Operations feed
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'monospace' }}>
            {items.length}
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
          All clear — no recent activity
        </div>
      ) : (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            borderLeft: `2px solid ${borderColour}`,
            paddingLeft: 16,
          }}
        >
          {items.map((item) => (
            <ActivityFeedRow key={item.id} item={item} isDarkMode={isDarkMode} isFresh={freshIds.has(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityFeedSection;