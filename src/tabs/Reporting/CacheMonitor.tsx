import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '@fluentui/react/lib/Button';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface CacheKey {
  label: string;
  key: string;
  group: string;
  status: 'hit' | 'miss' | 'offline' | 'error' | 'persist';
  ttl: number;
  age: number | null;
  size: number | null;
}

interface DiagnosticsData {
  connected: boolean;
  uptimeSeconds: number;
  keys: CacheKey[];
  timestamp: string;
}

interface AnalyticsData {
  totalKeys: number;
  hitRate: number;
  memoryUsage: string;
  topKeys: { key: string; hits: number }[];
  expirationDistribution: Record<string, number>;
}

interface CacheMonitorProps {
  onBack: () => void;
}

const POLL_INTERVAL = 8000;

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const statusColour = (status: string): string => {
  switch (status) {
    case 'hit': return colours.green;
    case 'miss': return colours.orange;
    case 'offline': return colours.cta;
    case 'error': return colours.cta;
    case 'persist': return colours.blue;
    default: return colours.subtleGrey;
  }
};

const CacheMonitor: React.FC<CacheMonitorProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [diagRes, analyticsRes] = await Promise.all([
        fetch('/api/cache-preheater/diagnostics'),
        fetch('/api/cache-preheater/analytics'),
      ]);
      if (diagRes.ok) {
        const d = await diagRes.json();
        if (d.success) setDiagnostics(d);
      }
      if (analyticsRes.ok) {
        const a = await analyticsRes.json();
        if (a.success) setAnalytics(a.analytics);
      }
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch cache data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const bg = isDarkMode ? 'rgba(10, 28, 50, 0.95)' : '#fff';
  const border = isDarkMode ? 'rgba(75, 85, 99, 0.38)' : 'rgba(6, 23, 51, 0.08)';
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const help = isDarkMode ? colours.subtleGrey : colours.greyText;

  if (loading && !diagnostics) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Spinner size={SpinnerSize.large} label="Loading cache diagnostics..." />
      </div>
    );
  }

  const opsKeys = diagnostics?.keys.filter(k => k.group === 'ops-queue') ?? [];
  const streamKeys = diagnostics?.keys.filter(k => k.group === 'reporting') ?? [];
  const hitCount = diagnostics?.keys.filter(k => k.status === 'hit').length ?? 0;
  const totalCount = diagnostics?.keys.length ?? 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto', fontFamily: 'Raleway, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>
            Cache Monitor
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: help }}>
            Redis state · refreshes every {POLL_INTERVAL / 1000}s
          </p>
        </div>
        <IconButton
          iconProps={{ iconName: 'Refresh' }}
          ariaLabel="Refresh"
          onClick={() => { setLoading(true); fetchData(); }}
          styles={{ root: { color: help, borderRadius: 0 } }}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(214, 85, 65, 0.1)', border: `1px solid ${colours.cta}`, fontSize: 12, color: colours.cta }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Connection', value: diagnostics?.connected ? 'Connected' : 'Offline', colour: diagnostics?.connected ? colours.green : colours.cta },
          { label: 'Server uptime', value: diagnostics ? formatUptime(diagnostics.uptimeSeconds) : '—', colour: colours.blue },
          { label: 'Cached keys', value: `${hitCount}/${totalCount}`, colour: hitCount === totalCount && totalCount > 0 ? colours.green : colours.orange },
          { label: 'Hit rate', value: analytics ? `${(analytics.hitRate * 100).toFixed(0)}%` : '—', colour: analytics && analytics.hitRate > 0.7 ? colours.green : colours.orange },
        ].map((card, i) => (
          <div key={i} style={{
            padding: '14px 16px',
            background: bg,
            border: `0.5px solid ${border}`,
            borderRadius: 0,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: help, marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: card.colour }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Ops-queue keys */}
      {opsKeys.length > 0 && (
        <Section title="Operations queue cache" isDarkMode={isDarkMode}>
          {opsKeys.map(k => <KeyRow key={k.key} item={k} isDarkMode={isDarkMode} />)}
        </Section>
      )}

      {/* Reporting stream keys */}
      {streamKeys.length > 0 && (
        <Section title="Reporting stream cache" isDarkMode={isDarkMode}>
          {streamKeys.map(k => <KeyRow key={k.key} item={k} isDarkMode={isDarkMode} />)}
        </Section>
      )}

      {/* Expiration distribution */}
      {analytics?.expirationDistribution && Object.keys(analytics.expirationDistribution).length > 0 && (
        <Section title="TTL distribution" isDarkMode={isDarkMode}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(analytics.expirationDistribution).map(([bucket, count]) => (
              <div key={bucket} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>{count}</div>
                <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 2 }}>{bucket}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Top keys */}
      {analytics?.topKeys && analytics.topKeys.length > 0 && (
        <Section title="Most accessed keys" isDarkMode={isDarkMode}>
          {analytics.topKeys.slice(0, 10).map((tk, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px',
              borderBottom: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(6, 23, 51, 0.04)'}`,
              fontSize: 12,
            }}>
              <span style={{ color: isDarkMode ? '#d1d5db' : '#374151', fontFamily: 'monospace', fontSize: 11 }}>
                {tk.key.length > 60 ? `…${tk.key.slice(-55)}` : tk.key}
              </span>
              <span style={{ color: isDarkMode ? colours.accent : colours.highlight, fontWeight: 600 }}>
                {tk.hits} hits
              </span>
            </div>
          ))}
        </Section>
      )}

      {diagnostics && (
        <div style={{ marginTop: 16, fontSize: 10, color: help, textAlign: 'right' }}>
          Last updated: {new Date(diagnostics.timestamp).toLocaleTimeString('en-GB')}
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ── */

const Section: React.FC<{ title: string; isDarkMode: boolean; children: React.ReactNode }> = ({ title, isDarkMode, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 10, paddingLeft: 10,
      borderLeft: `2px solid ${isDarkMode ? colours.subtleGrey : colours.greyText}`,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
        letterSpacing: '0.06em', color: isDarkMode ? colours.subtleGrey : colours.greyText,
      }}>
        {title}
      </span>
    </div>
    {children}
  </div>
);

const KeyRow: React.FC<{ item: CacheKey; isDarkMode: boolean }> = ({ item, isDarkMode }) => {
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const help = isDarkMode ? colours.subtleGrey : colours.greyText;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(6, 23, 51, 0.04)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: statusColour(item.status), display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
          {item.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
        <span style={{ color: statusColour(item.status), fontWeight: 600, textTransform: 'uppercase' as const, fontSize: 10, letterSpacing: '0.04em' }}>
          {item.status}
        </span>
        {item.ttl > 0 && (
          <span style={{ color: body }}>
            TTL {item.ttl}s
          </span>
        )}
        {item.age !== null && (
          <span style={{ color: help }}>
            Age {item.age}s
          </span>
        )}
        <span style={{ color: help }}>
          {formatBytes(item.size)}
        </span>
      </div>
    </div>
  );
};

export default CacheMonitor;
