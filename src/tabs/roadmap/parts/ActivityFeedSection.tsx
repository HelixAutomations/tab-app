import React, { useCallback, useState } from 'react';
import { app } from '@microsoft/teams-js';
import DataFreshnessIndicator from '../../../components/DataFreshnessIndicator';
import { colours } from '../../../app/styles/colours';
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

const ActivityFeedRow: React.FC<{ item: ActivityFeedItem; isDarkMode: boolean }> = ({ item, isDarkMode }) => {
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
              color: isDarkMode ? '#d1d5db' : '#374151',
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
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accentColour = isDarkMode ? colours.accent : colours.highlight;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const surfaceColour = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;

  return (
    <div style={{ marginBottom: 28, maxWidth: 800 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          marginBottom: 12, flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: accentColour, opacity: 0.85,
            }}
          >
            Live operations
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: textColour, letterSpacing: '-0.2px' }}>
            Operations feed
          </div>
          <div style={{ fontSize: 12, color: mutedColour, marginTop: 4 }}>
            Enquiry cards, DM sends, bot actions, and card lab traffic. Tasking and time-entry events can plug into this same lane later.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <DataFreshnessIndicator
            label="Activity"
            isRefreshing={isRefreshing}
            isSnapshot={isSnapshot}
            lastLiveSyncAt={lastLiveSyncAt}
            errorDetail={items.length > 0 ? error : null}
            snapshotLabel="Delayed"
            compact
          />
          <span
            style={{
              fontSize: 11,
              color: mutedColour,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 0,
              background: surfaceColour,
            }}
          >
            {items.length}
          </span>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 16, fontSize: 12, lineHeight: 1.5,
            color: colours.cta,
            background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)',
          }}
        >
          {error}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 16, fontSize: 12, lineHeight: 1.5,
            color: mutedColour,
            background: surfaceColour,
          }}
        >
          No operational activity has been recorded yet.
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
            <ActivityFeedRow key={item.id} item={item} isDarkMode={isDarkMode} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityFeedSection;