import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconButton } from '@fluentui/react/lib/Button';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface TierState {
  status: string | null;
  slotKey: string | null;
  ts: number | null;
  durationMs?: number;
  error?: string;
}

interface NextFire {
  minsUntil: number;
  schedule: string;
}

interface SchedulerState {
  shuttingDown: boolean;
  tickIntervalMs: number;
  idleStreak: number;
  tiers: {
    collected: { hot: TierState | null; warm: TierState | null; cold: TierState | null; monthly: TierState | null };
    wip: { hot: TierState | null; warm: TierState | null; cold: TierState | null };
  };
  mutex: { held: boolean; holder?: string; acquiredAt?: number };
  nextFires: Record<string, NextFire>;
}

interface LogEntry {
  operation: string;
  status: string;
  ts: number;
  message?: string;
}

interface SyncHistoryData {
  scheduler: SchedulerState;
  recentLog: Record<string, LogEntry[]>;
  serverTime: number;
}

interface SyncHistoryProps {
  onBack: () => void;
}

const POLL_INTERVAL_MS = 30_000;

const TIER_LABELS: Record<string, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
  monthly: 'Monthly',
};

const NEXT_FIRE_KEYS: Record<string, Record<string, string>> = {
  collected: { hot: 'collectedHot', warm: 'collectedWarm', cold: 'collectedCold' },
  wip: { hot: 'wipHot', warm: 'wipWarm', cold: 'wipCold' },
};

function formatAgo(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function statusColour(status: string | null): string {
  if (!status) return colours.subtleGrey;
  switch (status) {
    case 'completed': return colours.green;
    case 'running': return colours.blue;
    case 'error': case 'timeout': return colours.cta;
    case 'skipped': return colours.orange;
    default: return colours.subtleGrey;
  }
}

function statusIcon(status: string | null): string {
  if (!status) return 'CircleRing';
  switch (status) {
    case 'completed': return 'SkypeCircleCheck';
    case 'running': return 'Sync';
    case 'error': case 'timeout': return 'StatusErrorFull';
    case 'skipped': return 'SkypeCircleMinus';
    default: return 'CircleRing';
  }
}

const SyncHistory: React.FC<SyncHistoryProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const [data, setData] = useState<SyncHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/data-operations/sync-history');
      if (!res.ok) throw new Error(`${res.status}`);
      const json: SyncHistoryData = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    timerRef.current = setInterval(fetchHistory, POLL_INTERVAL_MS);
    clockRef.current = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [fetchHistory]);

  const cardBg = isDarkMode ? colours.dark.cardBackground : '#fff';
  const sectionBg = isDarkMode ? colours.dark.sectionBackground : colours.grey;
  const borderCol = isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.08)';
  const labelCol = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyCol = isDarkMode ? '#d1d5db' : '#374151';
  const helpCol = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accentCol = isDarkMode ? colours.accent : colours.highlight;

  const renderTierRow = (entity: 'collected' | 'wip', tierKey: string, tier: TierState | null) => {
    const nextFireKey = NEXT_FIRE_KEYS[entity]?.[tierKey];
    const nextFire = nextFireKey && data?.scheduler.nextFires[nextFireKey];

    return (
      <div
        key={`${entity}-${tierKey}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderBottom: `0.5px solid ${borderCol}`,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? colours.dark.cardHover : 'rgba(244, 244, 246, 0.6)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Status dot */}
        <FontIcon
          iconName={statusIcon(tier?.status ?? null)}
          style={{ fontSize: 14, color: statusColour(tier?.status ?? null), flexShrink: 0 }}
        />

        {/* Tier name */}
        <span style={{ fontSize: 12, fontWeight: 600, color: labelCol, width: 58, fontFamily: 'Raleway, sans-serif' }}>
          {TIER_LABELS[tierKey] || tierKey}
        </span>

        {/* Last run time */}
        <span style={{ fontSize: 11, color: bodyCol, flex: 1 }}>
          {tier?.ts ? formatAgo(tier.ts, now) : '—'}
        </span>

        {/* Duration */}
        <span style={{ fontSize: 11, color: helpCol, width: 60, textAlign: 'right' }}>
          {tier?.durationMs ? formatDuration(tier.durationMs) : '—'}
        </span>

        {/* Next fire */}
        {nextFire && (
          <span style={{ fontSize: 10, color: helpCol, width: 68, textAlign: 'right' }}>
            in {nextFire.minsUntil}m
          </span>
        )}

        {/* Error indicator */}
        {tier?.error && (
          <FontIcon iconName="Warning" style={{ fontSize: 12, color: colours.cta, marginLeft: 2 }} title={tier.error} />
        )}
      </div>
    );
  };

  const renderEntitySection = (entity: 'collected' | 'wip', label: string) => {
    const tiers = data?.scheduler.tiers[entity];
    if (!tiers) return null;
    const tierKeys = Object.keys(tiers) as string[];

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: 0.6,
          color: accentCol,
          padding: '6px 12px 4px',
          fontFamily: 'Raleway, sans-serif',
        }}>
          {label}
        </div>
        <div style={{
          background: cardBg,
          border: `0.5px solid ${borderCol}`,
          borderRadius: 0,
          overflow: 'hidden',
        }}>
          {tierKeys.map((k) => renderTierRow(entity, k, (tiers as Record<string, TierState | null>)[k]))}
        </div>
      </div>
    );
  };

  const renderMutexStrip = () => {
    const mx = data?.scheduler.mutex;
    if (!mx) return null;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: mx.held
          ? isDarkMode ? 'rgba(255, 140, 0, 0.08)' : 'rgba(255, 140, 0, 0.06)'
          : 'transparent',
        borderRadius: 0,
        border: mx.held ? `0.5px solid ${colours.orange}33` : 'none',
        marginBottom: 10,
      }}>
        <FontIcon
          iconName={mx.held ? 'Lock' : 'Unlock'}
          style={{ fontSize: 12, color: mx.held ? colours.orange : colours.green }}
        />
        <span style={{ fontSize: 11, color: bodyCol }}>
          {mx.held
            ? `Mutex held by ${mx.holder || 'unknown'}${mx.acquiredAt ? ` · ${formatAgo(mx.acquiredAt, now)}` : ''}`
            : 'Mutex idle'}
        </span>
      </div>
    );
  };

  const renderSchedulerMeta = () => {
    const s = data?.scheduler;
    if (!s) return null;
    return (
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '4px 12px 8px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, color: helpCol }}>
          Tick: {(s.tickIntervalMs / 1000).toFixed(0)}s
        </span>
        <span style={{ fontSize: 10, color: helpCol }}>
          Idle streak: {s.idleStreak}
        </span>
        {s.shuttingDown && (
          <span style={{ fontSize: 10, color: colours.cta, fontWeight: 600 }}>
            Shutting down
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: isDarkMode ? colours.dark.background : '#fff',
      color: labelCol,
      fontFamily: 'Raleway, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderBottom: `0.5px solid ${borderCol}`,
        background: sectionBg,
      }}>
        <IconButton
          ariaLabel="Back"
          iconProps={{ iconName: 'ChevronLeft' }}
          onClick={onBack}
          styles={{
            root: { width: 28, height: 28, borderRadius: 0, color: helpCol },
            rootHovered: { background: isDarkMode ? colours.dark.cardHover : colours.grey },
          }}
        />
        <FontIcon iconName="Sync" style={{ fontSize: 16, color: accentCol }} />
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          color: labelCol,
        }}>
          Sync History
        </span>
        <span style={{ flex: 1 }} />
        <IconButton
          ariaLabel="Refresh"
          iconProps={{ iconName: 'Refresh' }}
          onClick={() => { setLoading(true); fetchHistory(); }}
          styles={{
            root: { width: 28, height: 28, borderRadius: 0, color: helpCol },
            rootHovered: { background: isDarkMode ? colours.dark.cardHover : colours.grey },
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading && !data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Spinner size={SpinnerSize.medium} label="Loading scheduler state..." />
          </div>
        )}

        {error && !data && (
          <div style={{
            padding: '12px 14px',
            background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)',
            border: `0.5px solid ${colours.cta}33`,
            color: bodyCol,
            fontSize: 12,
          }}>
            Failed to load sync history: {error}
          </div>
        )}

        {data && (
          <>
            {renderMutexStrip()}
            {renderEntitySection('collected', 'Collected Time')}
            {renderEntitySection('wip', 'WIP / Recorded Time')}
            {renderSchedulerMeta()}

            {/* Recent log entries */}
            {Object.keys(data.recentLog).length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.6,
                  color: accentCol,
                  padding: '6px 12px 4px',
                  fontFamily: 'Raleway, sans-serif',
                }}>
                  Recent Operations
                </div>
                <div style={{
                  background: cardBg,
                  border: `0.5px solid ${borderCol}`,
                  borderRadius: 0,
                  overflow: 'hidden',
                  maxHeight: 220,
                  overflowY: 'auto',
                }}>
                  {Object.entries(data.recentLog)
                    .flatMap(([, entries]) => entries)
                    .sort((a, b) => b.ts - a.ts)
                    .slice(0, 12)
                    .map((entry, i) => (
                    <div
                      key={`log-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 12px',
                        borderBottom: `0.5px solid ${borderCol}`,
                        fontSize: 11,
                      }}
                    >
                      <FontIcon
                        iconName={entry.status === 'completed' ? 'SkypeCircleCheck' : entry.status === 'error' ? 'StatusErrorFull' : 'CircleRing'}
                        style={{ fontSize: 11, color: entry.status === 'completed' ? colours.green : entry.status === 'error' ? colours.cta : helpCol }}
                      />
                      <span style={{ color: bodyCol, flex: 1 }}>{entry.operation}</span>
                      <span style={{ color: helpCol, fontSize: 10 }}>{formatAgo(entry.ts, now)}</span>
                      {entry.message && (
                        <span style={{
                          color: entry.status === 'error' ? colours.cta : helpCol,
                          fontSize: 10,
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }} title={entry.message}>
                          {entry.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 16px',
        borderTop: `0.5px solid ${borderCol}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 10,
        color: helpCol,
      }}>
        <span>Polls every {POLL_INTERVAL_MS / 1000}s</span>
        {data && <span>Server time: {new Date(data.serverTime).toLocaleTimeString('en-GB')}</span>}
      </div>
    </div>
  );
};

export default React.memo(SyncHistory);
