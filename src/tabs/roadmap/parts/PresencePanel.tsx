// src/tabs/roadmap/parts/PresencePanel.tsx — who is online and what tab they're viewing

import React from 'react';
import { colours } from '../../../app/styles/colours';
import type { PresenceData } from './ops-pulse-types';

interface Props {
  presence: PresenceData | null;
  isDarkMode: boolean;
}

/** Human-friendly tab labels */
function tabLabel(key: string): string {
  const labels: Record<string, string> = {
    home: 'Home',
    enquiries: 'Enquiries',
    matters: 'Matters',
    instructions: 'Instructions',
    reporting: 'Reporting',
    roadmap: 'Activity',
    blueprints: 'Blueprints',
    resources: 'Resources',
    forms: 'Forms',
  };
  return labels[key] || key;
}

/** How long since last heartbeat */
function staleness(lastSeen: number): string {
  const ago = Math.floor((Date.now() - lastSeen) / 1000);
  if (ago < 10) return 'now';
  if (ago < 60) return `${ago}s ago`;
  return `${Math.floor(ago / 60)}m ago`;
}

const PresencePanel: React.FC<Props> = ({ presence, isDarkMode }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          Who's Here
        </span>
        {presence && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: `${colours.green}30`, color: colours.green, fontFamily: 'monospace' }}>
            {presence.online} online
          </span>
        )}
      </div>

      {!presence || presence.list.length === 0 ? (
        <div style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No one online
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {presence.list.map((p) => (
            <div
              key={p.initials}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: isDarkMode ? 'rgba(255,255,255,0.04)' : colours.grey,
                border: `1px solid ${borderCol}`, borderRadius: 0,
              }}
            >
              {/* Green dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: colours.green, flexShrink: 0 }} />

              {/* Initials */}
              <span style={{ fontSize: 12, fontWeight: 700, width: 30, color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
                {p.initials}
              </span>

              {/* Name */}
              <span style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'Raleway, sans-serif', flex: 1 }}>
                {p.name}
              </span>

              {/* Tab pill */}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 0,
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
                color: isDarkMode ? colours.accent : colours.highlight,
                fontFamily: 'monospace',
              }}>
                {tabLabel(p.tab)}
              </span>

              {/* Staleness */}
              <span style={{ fontSize: 10, color: colours.subtleGrey, fontFamily: 'monospace', minWidth: 40, textAlign: 'right' as const }}>
                {staleness(p.lastSeen)}
              </span>
            </div>
          ))}

          {/* Tab summary */}
          {Object.keys(presence.tabs).length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${borderCol}` }}>
              {Object.entries(presence.tabs).map(([tab, count]) => (
                <span key={tab} style={{ fontSize: 10, color: colours.subtleGrey, fontFamily: 'monospace' }}>
                  {tabLabel(tab)}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PresencePanel;
