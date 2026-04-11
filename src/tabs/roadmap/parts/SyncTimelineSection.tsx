// src/tabs/roadmap/parts/SyncTimelineSection.tsx — sync status + timeline for Helix Eye

import React from 'react';
import { colours } from '../../../app/styles/colours';
import type { SchedulerData, TierStatus, MutexState } from './ops-pulse-types';

interface Props {
  scheduler: SchedulerData | null;
  isDarkMode: boolean;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function statusColour(status: string | null): string {
  switch (status) {
    case 'running': return colours.highlight;
    case 'queued': return colours.orange;
    case 'completed': return colours.green;
    case 'failed': return colours.cta;
    default: return colours.subtleGrey;
  }
}

function TierRow({ label, tier, nextFire, isDarkMode }: { label: string; tier: TierStatus | null; nextFire?: { minsUntil: number; schedule: string }; isDarkMode: boolean }) {
  const dotColor = statusColour(tier?.status || null);
  const isActive = tier?.status === 'running' || tier?.status === 'queued';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: isActive ? `0 0 6px ${dotColor}` : 'none' }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif', width: 120 }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', fontFamily: 'Raleway, sans-serif', flex: 1 }}>
        {tier?.status || 'idle'}
        {tier?.status === 'running' && tier.ts ? ` (${timeAgo(tier.ts)})` : ''}
        {tier?.error ? ` — ${tier.error}` : ''}
      </span>
      {nextFire && (
        <span style={{ fontSize: 10, color: colours.subtleGrey, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          next in {nextFire.minsUntil}m ({nextFire.schedule})
        </span>
      )}
    </div>
  );
}

function MutexIndicator({ mutex, isDarkMode }: { mutex: MutexState; isDarkMode: boolean }) {
  if (!mutex.locked) {
    return (
      <div style={{ fontSize: 11, color: colours.green, fontFamily: 'Raleway, sans-serif', padding: '4px 0' }}>
        Mutex: idle
      </div>
    );
  }

  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{ fontSize: 11, color: isDarkMode ? colours.accent : colours.highlight, fontFamily: 'Raleway, sans-serif', fontWeight: 600 }}>
        Mutex: {mutex.holder?.name} ({formatDuration(mutex.holder?.heldMs || 0)})
        {mutex.queueDepth > 0 && <span style={{ color: colours.orange }}> +{mutex.queueDepth} queued</span>}
      </div>
      {mutex.queue.length > 0 && (
        <div style={{ fontSize: 10, color: colours.subtleGrey, marginTop: 2 }}>
          Queue: {mutex.queue.join(' → ')}
        </div>
      )}
    </div>
  );
}

const SyncTimelineSection: React.FC<Props> = ({ scheduler, isDarkMode }) => {
  const bg = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const sectionAccent = isDarkMode ? colours.accent : colours.highlight;

  if (!scheduler) {
    return (
      <div style={{ padding: 16, background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: colours.subtleGrey }}>Waiting for scheduler data...</span>
      </div>
    );
  }

  const { tiers, mutex, nextFires } = scheduler;

  return (
    <div style={{ padding: '14px 16px', background: bg, border: `1px solid ${borderCol}`, borderRadius: 0, marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: sectionAccent, marginBottom: 10, fontFamily: 'Raleway, sans-serif' }}>
        Sync Timeline
      </div>

      <MutexIndicator mutex={mutex} isDarkMode={isDarkMode} />

      <div style={{ marginTop: 8, borderLeft: `2px solid ${borderCol}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: colours.subtleGrey, padding: '4px 0', fontFamily: 'Raleway, sans-serif' }}>
          Collected Time
        </div>
        <TierRow label="Hot (hourly)" tier={tiers.collected.hot} nextFire={nextFires.collectedHot} isDarkMode={isDarkMode} />
        <TierRow label="Warm (6h)" tier={tiers.collected.warm} nextFire={nextFires.collectedWarm} isDarkMode={isDarkMode} />
        <TierRow label="Cold (nightly)" tier={tiers.collected.cold} nextFire={nextFires.collectedCold} isDarkMode={isDarkMode} />
        <TierRow label="Monthly" tier={tiers.collected.monthly} isDarkMode={isDarkMode} />

        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: colours.subtleGrey, padding: '8px 0 4px', fontFamily: 'Raleway, sans-serif' }}>
          WIP
        </div>
        <TierRow label="Hot (hourly)" tier={tiers.wip.hot} nextFire={nextFires.wipHot} isDarkMode={isDarkMode} />
        <TierRow label="Warm (6h)" tier={tiers.wip.warm} nextFire={nextFires.wipWarm} isDarkMode={isDarkMode} />
        <TierRow label="Cold (nightly)" tier={tiers.wip.cold} nextFire={nextFires.wipCold} isDarkMode={isDarkMode} />
      </div>

      {/* Recent history */}
      {mutex.recentHistory.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: colours.subtleGrey, padding: '4px 0', fontFamily: 'Raleway, sans-serif' }}>
            Recent completions
          </div>
          {mutex.recentHistory.slice(0, 5).map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', fontFamily: 'Raleway, sans-serif' }}>
              <span style={{ color: colours.green, fontSize: 10 }}>●</span>
              <span style={{ fontWeight: 600 }}>{h.name}</span>
              <span style={{ color: colours.subtleGrey }}>{formatDuration(h.durationMs)}</span>
              <span style={{ color: colours.subtleGrey, fontFamily: 'monospace', fontSize: 10 }}>{timeAgo(h.completedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyncTimelineSection;
