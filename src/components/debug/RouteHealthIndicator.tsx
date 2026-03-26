import React, { useState, useEffect, useCallback, useRef } from 'react';
import { colours } from '../../app/styles/colours';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RouteCheck {
  id: string;
  name: string;
  group: string;
  status: 'healthy' | 'unhealthy' | 'error';
  responseMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface HealthPayload {
  timestamp: string;
  summary: { healthy: number; unhealthy: number; total: number };
  durationMs: number;
  checks: RouteCheck[];
}

type EnvResult = {
  env: 'local' | 'production';
  status: 'ok' | 'fail' | 'loading';
  data: HealthPayload | null;
  error: string | null;
};

const PRODUCTION_BASE = 'https://helix-hub.azurewebsites.net';
const POLL_INTERVAL = 60_000; // re-check every 60 s

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const RouteHealthIndicator: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<EnvResult[]>([
    { env: 'local', status: 'loading', data: null, error: null },
    { env: 'production', status: 'loading', data: null, error: null },
  ]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async (env: 'local' | 'production') => {
    const base = env === 'local' ? '' : PRODUCTION_BASE;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${base}/api/route-health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthPayload = await res.json();
      return { env, status: 'ok' as const, data, error: null };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : 'Unknown';
      return { env, status: 'fail' as const, data: null, error: msg };
    }
  }, []);

  const runProbes = useCallback(async () => {
    const [local, prod] = await Promise.all([probe('local'), probe('production')]);
    setResults([local, prod]);
  }, [probe]);

  useEffect(() => {
    runProbes();
    intervalRef.current = setInterval(runProbes, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runProbes]);

  // Derive overall colour
  const overallColour = (() => {
    const allOk = results.every((r) => r.status === 'ok' && r.data?.summary.unhealthy === 0);
    const anyFail = results.some((r) => r.status === 'fail');
    if (allOk) return colours.green;
    if (anyFail) return colours.cta;
    return colours.orange;
  })();

  const dotColour = (r: EnvResult) => {
    if (r.status === 'loading') return colours.subtleGrey;
    if (r.status === 'fail') return colours.cta;
    if (r.data && r.data.summary.unhealthy > 0) return colours.orange;
    return colours.green;
  };

  const label = (r: EnvResult) => {
    if (r.status === 'loading') return '…';
    if (r.status === 'fail') return 'DOWN';
    const s = r.data!.summary;
    return `${s.healthy}/${s.total}`;
  };

  // Only render in development
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      {/* Compact pill — always visible */}
      <button
        onClick={() => setExpanded((p) => !p)}
        title="Route Health Indicator (click to expand)"
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          background: 'rgba(6, 23, 51, 0.92)',
          border: `1px solid ${overallColour}44`,
          borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#d1d5db',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: `0 2px 12px rgba(0,0,0,0.35), inset 0 0 0 1px ${overallColour}22`,
          transition: 'all 0.2s ease',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: overallColour,
            boxShadow: `0 0 6px ${overallColour}88`,
            flexShrink: 0,
          }}
        />
        <span style={{ letterSpacing: '0.03em' }}>ROUTES</span>
        {results.map((r) => (
          <span
            key={r.env}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: dotColour(r),
              }}
            />
            <span style={{ fontSize: 10, opacity: 0.8 }}>
              {r.env === 'local' ? 'L' : 'P'}:{label(r)}
            </span>
          </span>
        ))}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            position: 'fixed',
            bottom: 52,
            left: 20,
            zIndex: 1501,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'rgba(6, 23, 51, 0.96)',
            border: `1px solid ${colours.dark.border}`,
            borderRadius: 0,
            padding: 0,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#d1d5db',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${colours.dark.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: colours.darkBlue,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: colours.accent }}>
              ROUTE HEALTH
            </span>
            <button
              onClick={runProbes}
              style={{
                background: 'none',
                border: `1px solid ${colours.dark.border}`,
                borderRadius: 0,
                color: '#d1d5db',
                cursor: 'pointer',
                padding: '2px 8px',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            >
              ↻ refresh
            </button>
          </div>

          {/* Environment sections */}
          {results.map((r) => (
            <div key={r.env} style={{ borderBottom: `1px solid ${colours.dark.border}` }}>
              <div
                style={{
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(13, 47, 96, 0.3)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColour(r),
                    boxShadow: `0 0 4px ${dotColour(r)}66`,
                  }}
                />
                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>
                  {r.env}
                </span>
                {r.status === 'ok' && r.data && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>
                    {r.data.summary.healthy}/{r.data.summary.total} · {r.data.durationMs}ms
                  </span>
                )}
                {r.status === 'fail' && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: colours.cta }}>{r.error}</span>
                )}
                {r.status === 'loading' && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>probing…</span>
                )}
              </div>

              {/* Individual checks */}
              {r.status === 'ok' && r.data && (
                <div style={{ padding: '2px 0' }}>
                  {r.data.checks.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 12px 3px 24px',
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: c.status === 'healthy' ? colours.green : colours.cta,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>
                        {c.group}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          flexShrink: 0,
                          minWidth: 36,
                          textAlign: 'right',
                          color: c.status === 'healthy' ? colours.green : colours.cta,
                        }}
                      >
                        {c.status === 'healthy' ? `${c.responseMs}ms` : 'FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Timestamp */}
          <div style={{ padding: '4px 12px', fontSize: 9, opacity: 0.4, textAlign: 'right' }}>
            {results[0]?.data?.timestamp
              ? `Last: ${new Date(results[0].data.timestamp).toLocaleTimeString()}`
              : '—'}
          </div>
        </div>
      )}
    </>
  );
};

export default RouteHealthIndicator;
