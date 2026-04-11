/**
 * PipelineActivityTimeline — Renders an enquiry's contact activity timeline.
 * Fetches from /api/pipeline-activity/:enquiryId on mount.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

export interface ActivityEntry {
  id: number | string;
  enquiryId: string;
  activityType: 'auto-detected' | 'confirmed' | 'override';
  channel?: string;
  direction?: 'inbound' | 'outbound';
  timestamp: string;
  actor?: string;
  subject?: string;
  source?: string;
  createdAt?: string;
  notes?: string;
}

interface Props {
  enquiryId: string;
}

const channelIcon: Record<string, string> = {
  email: 'Mail',
  call: 'Phone',
  teams: 'TeamsLogo16',
  meeting: 'Calendar',
  sms: 'Message',
};

const typeLabel: Record<string, { label: string; color: string }> = {
  'auto-detected': { label: 'Auto', color: colours.highlight },
  confirmed: { label: 'Confirmed', color: colours.green },
  override: { label: 'Override', color: colours.orange },
};

const PipelineActivityTimeline: React.FC<Props> = ({ enquiryId }) => {
  const { isDarkMode } = useTheme();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline-activity/${encodeURIComponent(enquiryId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [enquiryId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const formatTimestamp = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const lineColor = isDarkMode ? 'rgba(75, 85, 99, 0.38)' : 'rgba(160, 160, 160, 0.28)';
  const bodyColor = isDarkMode ? '#d1d5db' : '#374151';
  const helpColor = isDarkMode ? colours.subtleGrey : colours.greyText;

  if (loading) {
    return (
      <section className="helix-panel prospect-overview-panel prospect-overview-enter" data-tier="1.5">
        <div className="prospect-overview-panel-head">
          <div>
            <div className="prospect-overview-panel-kicker">Pipeline</div>
            <h3 className="prospect-overview-panel-title">Contact timeline</h3>
          </div>
        </div>
        <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 8, color: helpColor, fontSize: 12 }}>
          <Icon iconName="ProgressRingDots" styles={{ root: { fontSize: 14, color: colours.highlight } }} />
          Loading activity…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="helix-panel prospect-overview-panel prospect-overview-enter" data-tier="1.5">
        <div className="prospect-overview-panel-head">
          <div>
            <div className="prospect-overview-panel-kicker">Pipeline</div>
            <h3 className="prospect-overview-panel-title">Contact timeline</h3>
          </div>
          <button type="button" className="prospect-overview-inline-action" onClick={fetchTimeline}>
            <Icon iconName="Refresh" />
            <span>Retry</span>
          </button>
        </div>
        <div style={{ padding: '16px 0', fontSize: 12, color: colours.cta }}>{error}</div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="helix-panel prospect-overview-panel prospect-overview-enter" data-tier="1.5">
        <div className="prospect-overview-panel-head">
          <div>
            <div className="prospect-overview-panel-kicker">Pipeline</div>
            <h3 className="prospect-overview-panel-title">Contact timeline</h3>
          </div>
        </div>
        <div style={{ padding: '16px 0', fontSize: 12, color: helpColor }}>No activity recorded yet.</div>
      </section>
    );
  }

  return (
    <section className="helix-panel prospect-overview-panel prospect-overview-enter" data-tier="1.5">
      <div className="prospect-overview-panel-head">
        <div>
          <div className="prospect-overview-panel-kicker">Pipeline</div>
          <h3 className="prospect-overview-panel-title">Contact timeline</h3>
        </div>
        <span style={{ fontSize: 11, color: helpColor }}>{entries.length} event{entries.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: 7,
          top: 4,
          bottom: 4,
          width: 2,
          background: lineColor,
          borderRadius: 0,
        }} />

        {entries.map((entry, idx) => {
          const meta = typeLabel[entry.activityType] ?? typeLabel['auto-detected'];
          const iconName = channelIcon[entry.channel ?? ''] ?? 'ActivityFeed';
          const isLast = idx === entries.length - 1;

          return (
            <div
              key={entry.id}
              style={{
                position: 'relative',
                paddingBottom: isLast ? 0 : 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {/* Dot on the line */}
              <div style={{
                position: 'absolute',
                left: -16,
                top: 3,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: meta.color,
                border: `2px solid ${isDarkMode ? colours.dark.cardBackground : '#fff'}`,
                zIndex: 1,
              }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon iconName={iconName} styles={{ root: { fontSize: 12, color: meta.color } }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                  {entry.channel ? entry.channel.charAt(0).toUpperCase() + entry.channel.slice(1) : 'Activity'}
                  {entry.direction ? ` (${entry.direction})` : ''}
                </span>
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: 0,
                  background: `${meta.color}1a`,
                  color: meta.color,
                  border: `1px solid ${meta.color}33`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}>
                  {meta.label}
                </span>
              </div>

              {entry.subject && (
                <div style={{ fontSize: 12, color: bodyColor, lineHeight: 1.4 }}>
                  {entry.subject}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: helpColor }}>
                <span>{formatTimestamp(entry.timestamp)}</span>
                {entry.actor && <span>by {entry.actor}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PipelineActivityTimeline;
