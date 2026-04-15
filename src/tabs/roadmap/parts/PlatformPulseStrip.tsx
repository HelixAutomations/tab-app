// src/tabs/roadmap/parts/PlatformPulseStrip.tsx — top-level status strip for Helix Eye

import React from 'react';
import { colours } from '../../../app/styles/colours';
import type { PulseData } from './ops-pulse-types';

interface Props {
  pulse: PulseData | null;
  connected: boolean;
  isDarkMode: boolean;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusDot({ ok, label, isDarkMode }: { ok: boolean | null; label: string; isDarkMode: boolean }) {
  const colour = ok === true ? colours.green : ok === false ? colours.cta : colours.subtleGrey;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colour, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'Raleway, sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

function MetricCell({ label, value, isDarkMode, accent }: { label: string; value: string | number; isDarkMode: boolean; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: accent ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text), fontFamily: 'Raleway, sans-serif', letterSpacing: '-0.3px' }}>
        {value}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

const PlatformPulseStrip: React.FC<Props> = ({ pulse, connected, isDarkMode }) => {
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;

  if (!pulse) {
    return (
      <div style={{ padding: '14px 18px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: colours.subtleGrey, animation: 'helix-spin 1s linear infinite' }} />
          <span style={{ fontSize: 12, color: colours.subtleGrey, fontFamily: 'Raleway, sans-serif' }}>Connecting to ops-pulse...</span>
        </div>
      </div>
    );
  }

  const { connections, requests } = pulse;

  return (
    <div style={{ padding: '14px 18px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
      {/* Left: connection dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <StatusDot ok={connected} label="SSE" isDarkMode={isDarkMode} />
        <StatusDot ok={connections.sql} label="SQL" isDarkMode={isDarkMode} />
        <StatusDot ok={connections.redis} label="Redis" isDarkMode={isDarkMode} />
        <StatusDot ok={connections.clio} label="Clio" isDarkMode={isDarkMode} />
        <StatusDot ok={connections.instructionsSql} label="Instr" isDarkMode={isDarkMode} />
      </div>

      {/* Centre: metrics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <MetricCell label="Uptime" value={formatUptime(pulse.uptimeSeconds)} isDarkMode={isDarkMode} />
        <MetricCell label="RPM" value={requests.rpm} isDarkMode={isDarkMode} accent />
        <MetricCell label="Avg ms" value={requests.avgMs} isDarkMode={isDarkMode} />
        <MetricCell label="P95 ms" value={requests.p95Ms} isDarkMode={isDarkMode} />
        <MetricCell label="5xx (5m)" value={requests.errors5min} isDarkMode={isDarkMode} accent={requests.errors5min > 0} />
      </div>

      {/* Right: scheduler badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: connections.scheduler ? colours.green : colours.subtleGrey }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontFamily: 'Raleway, sans-serif' }}>
          Scheduler
        </span>
      </div>
    </div>
  );
};

export default PlatformPulseStrip;
