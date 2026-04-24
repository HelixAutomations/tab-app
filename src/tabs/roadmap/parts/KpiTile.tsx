// src/tabs/roadmap/parts/KpiTile.tsx — compact dashboard KPI tile

import React from 'react';
import { colours } from '../../../app/styles/colours';

interface KpiTileProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  isDarkMode: boolean;
  active?: boolean;
  onClick?: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ label, value, hint, accent, isDarkMode, active, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  const valueColour = accent || (isDarkMode ? colours.dark.text : colours.light.text);
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderCol = active
    ? (accent || (isDarkMode ? colours.accent : colours.highlight))
    : (isDarkMode ? colours.dark.border : colours.light.border);
  const bg = isDarkMode
    ? (hovered || active ? 'rgba(255,255,255,0.04)' : colours.darkBlue)
    : (hovered || active ? 'rgba(54,144,206,0.04)' : colours.light.sectionBackground);

  const interactive = Boolean(onClick);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 6,
        padding: '12px 14px',
        background: bg,
        border: `1px solid ${borderCol}`,
        borderRadius: 0,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s',
        minHeight: 64,
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: muted,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: valueColour,
            letterSpacing: '-0.4px',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>{hint}</span>
        )}
      </div>
    </div>
  );
};

export default KpiTile;
