// src/tabs/roadmap/parts/SessionsPanel.tsx — active user connections for Helix Eye

import React from 'react';
import { colours } from '../../../app/styles/colours';
import type { SessionsData } from './ops-pulse-types';

interface Props {
  sessions: SessionsData | null;
  isDarkMode: boolean;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const SessionsPanel: React.FC<Props> = ({ sessions, isDarkMode }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          Sessions
        </span>
        {sessions && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: `${colours.green}30`, color: colours.green, fontFamily: 'monospace' }}>
            {sessions.totalConnections} conn · {sessions.uniqueUsers} users
          </span>
        )}
      </div>

      {!sessions || sessions.list.length === 0 ? (
        <div style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No active sessions
        </div>
      ) : (
        <>
          {/* User avatars row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {sessions.users.map((user) => {
              const connectionCount = sessions.list.filter((s) => s.user === user).length;
              return (
                <div
                  key={user}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    background: isDarkMode ? 'rgba(255,255,255,0.04)' : colours.grey,
                    border: `1px solid ${borderCol}`, borderRadius: 0,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: colours.green }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
                    {user}
                  </span>
                  <span style={{ fontSize: 10, color: colours.subtleGrey }}>{connectionCount}</span>
                </div>
              );
            })}
          </div>

          {/* Stream breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
            {sessions.list.map((s) => (
              <div
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'Raleway, sans-serif' }}
              >
                <span style={{ fontWeight: 600, width: 30 }}>{s.user}</span>
                <span style={{ color: isDarkMode ? colours.accent : colours.highlight, fontFamily: 'monospace', fontSize: 10, flex: 1 }}>
                  {s.stream}
                </span>
                <span style={{ color: colours.subtleGrey, fontSize: 10, fontFamily: 'monospace' }}>
                  {formatDuration(s.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default SessionsPanel;
