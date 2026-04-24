// src/tabs/roadmap/parts/ApiHeatSection.tsx — recent API request log for Helix Eye

import React from 'react';
import { colours } from '../../../app/styles/colours';
import { useFreshIds } from '../../../hooks/useFreshIds';
import type { RequestEntry } from './ops-pulse-types';

interface Props {
  requests: RequestEntry[];
  isDarkMode: boolean;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function methodColour(method: string): string {
  switch (method) {
    case 'GET': return colours.highlight;
    case 'POST': return colours.green;
    case 'PUT': return colours.orange;
    case 'DELETE': return colours.cta;
    default: return colours.subtleGrey;
  }
}

function statusColour(status: number): string {
  if (status < 300) return colours.green;
  if (status < 400) return colours.highlight;
  if (status < 500) return colours.orange;
  return colours.cta;
}

const SLOW_THRESHOLD_MS = 2000;

const ApiHeatSection: React.FC<Props> = ({ requests, isDarkMode }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const freshIds = useFreshIds(requests, (req) => `${req.ts}-${req.method}-${req.path}`);

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}>
          API Heat
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 0, background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'monospace' }}>
          {requests.length}
        </span>
      </div>

      {requests.length === 0 ? (
        <div style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif', padding: '8px 0' }}>
          No recent requests
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
          {requests.map((req, i) => {
            const isSlow = req.durationMs >= SLOW_THRESHOLD_MS;
            const isError = req.status >= 500;
            const freshKey = `${req.ts}-${req.method}-${req.path}`;

            return (
              <div
                key={`${req.ts}-${i}`}
                data-fresh={freshIds.has(freshKey) ? 'true' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11,
                  fontFamily: 'monospace',
                  background: isError ? (isDarkMode ? `${colours.cta}0F` : `${colours.cta}08`) : isSlow ? (isDarkMode ? `${colours.orange}0F` : `${colours.orange}08`) : 'transparent',
                  borderLeft: isError ? `2px solid ${colours.cta}` : isSlow ? `2px solid ${colours.orange}` : '2px solid transparent',
                }}
              >
                <span style={{ color: methodColour(req.method), fontWeight: 700, width: 36, fontSize: 10 }}>
                  {req.method}
                </span>
                <span style={{ color: statusColour(req.status), fontWeight: 600, width: 28, fontSize: 10 }}>
                  {req.status}
                </span>
                <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {req.path}
                </span>
                <span style={{ color: isSlow ? colours.orange : colours.subtleGrey, fontWeight: isSlow ? 700 : 400, width: 48, textAlign: 'right', fontSize: 10 }}>
                  {req.durationMs}ms
                </span>
                {req.user && (
                  <span style={{ color: colours.subtleGrey, width: 24, textAlign: 'center', fontSize: 10 }}>
                    {req.user}
                  </span>
                )}
                <span style={{ color: colours.subtleGrey, width: 30, textAlign: 'right', fontSize: 9 }}>
                  {timeAgo(req.ts)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApiHeatSection;
