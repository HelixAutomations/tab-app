// src/tabs/roadmap/HomeBootMonitor.tsx — Live waterfall of Home tab boot sequence (dev-only)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

type BootStatus = 'pending' | 'loading' | 'done' | 'error';

interface SourceState {
  status: BootStatus;
  firstSeen: number;
  loadingAt?: number;
  doneAt?: number;
}

type Phase = 'Shell Props' | 'Parallel Fetch' | 'Deferred' | 'Gates';

const SOURCE_PHASES: Record<string, Phase> = {
  enquiries: 'Shell Props',
  matters: 'Shell Props',
  instructionData: 'Shell Props',
  teamData: 'Shell Props',
  attendance: 'Parallel Fetch',
  annualLeave: 'Parallel Fetch',
  wipClio: 'Parallel Fetch',
  enquiryMetrics: 'Parallel Fetch',
  recoveredFees: 'Deferred',
  allMatters: 'Deferred',
  pendingDocActions: 'Deferred',
  parallelFetch: 'Gates',
  homePrimaryReady: 'Gates',
  secondaryPanelsReady: 'Gates',
  immediateActionsReady: 'Gates',
};

const PHASE_ORDER: Phase[] = ['Shell Props', 'Parallel Fetch', 'Deferred', 'Gates'];

const STATUS_COLOURS: Record<BootStatus, string> = {
  pending: colours.subtleGrey,
  loading: colours.highlight,
  done: colours.green,
  error: colours.cta,
};

const HomeBootMonitor: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [sources, setSources] = useState<Map<string, SourceState>>(new Map());
  const [bootStart, setBootStart] = useState<number | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const handleBootEvent = useCallback((e: Event) => {
    const { source, status, timestamp } = (e as CustomEvent).detail;

    setSources(prev => {
      const next = new Map(prev);
      const existing = next.get(source);

      const updated: SourceState = existing
        ? { ...existing, status }
        : { status, firstSeen: timestamp };

      if (status === 'loading' && !updated.loadingAt) {
        updated.loadingAt = timestamp;
      }
      if (status === 'done' && !updated.doneAt) {
        updated.doneAt = timestamp;
      }

      next.set(source, updated);
      return next;
    });

    setBootStart(prev => prev ?? timestamp);
  }, []);

  useEffect(() => {
    window.addEventListener('homeBootEvent', handleBootEvent);
    return () => window.removeEventListener('homeBootEvent', handleBootEvent);
  }, [handleBootEvent]);

  const reset = useCallback(() => {
    setSources(new Map());
    setBootStart(null);
  }, []);

  // Group sources by phase
  const grouped = PHASE_ORDER.map(phase => {
    const items = Array.from(sources.entries())
      .filter(([name]) => SOURCE_PHASES[name] === phase)
      .sort(([a], [b]) => a.localeCompare(b));
    return { phase, items };
  }).filter(g => g.items.length > 0);

  // Total boot time
  const allDone = sources.size > 0 && Array.from(sources.values()).every(s => s.status === 'done');
  const latestDone = Array.from(sources.values()).reduce((max, s) => Math.max(max, s.doneAt || 0), 0);
  const totalMs = allDone && bootStart ? Math.round(latestDone - bootStart) : null;

  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const surfaceColour = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;

  return (
    <div style={{ marginBottom: 28, maxWidth: 800 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 16, fontWeight: 700, color: textColour,
            letterSpacing: '-0.2px', fontFamily: 'Raleway, sans-serif',
          }}>
            Home Boot Monitor
          </span>
          {totalMs !== null && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: colours.green,
              padding: '2px 8px', background: `${colours.green}18`,
              fontFamily: 'monospace',
            }}>
              {totalMs}ms
            </span>
          )}
          {sources.size > 0 && !allDone && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: colours.highlight,
              padding: '2px 8px', background: `${colours.highlight}18`,
              fontFamily: 'monospace',
            }}>
              booting…
            </span>
          )}
        </div>
        <button
          onClick={reset}
          style={{
            fontSize: 10, fontWeight: 700, color: mutedColour,
            background: 'transparent', border: `1px solid ${borderColour}`,
            padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'Raleway, sans-serif', letterSpacing: '0.3px',
            textTransform: 'uppercase',
          }}
        >
          Reset
        </button>
      </div>

      {sources.size === 0 ? (
        <div style={{
          padding: '16px 14px', fontSize: 12, color: mutedColour,
          background: surfaceColour, fontStyle: 'italic',
        }}>
          Waiting for Home tab events…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grouped.map(({ phase, items }) => (
            <div key={phase}>
              <div style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDarkMode ? colours.accent : colours.highlight,
                marginBottom: 6, opacity: 0.85,
              }}>
                {phase}
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 1,
                borderLeft: `2px solid ${borderColour}`,
                paddingLeft: 14,
              }}>
                {items.map(([name, state]) => {
                  const duration = state.loadingAt && state.doneAt
                    ? Math.round(state.doneAt - state.loadingAt)
                    : state.firstSeen && state.doneAt
                      ? Math.round(state.doneAt - state.firstSeen)
                      : null;

                  return (
                    <div
                      key={name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '5px 10px',
                        fontSize: 12, fontFamily: 'Raleway, sans-serif',
                      }}
                    >
                      <div style={{
                        width: 7, height: 7, borderRadius: 999,
                        background: STATUS_COLOURS[state.status],
                        flexShrink: 0,
                        transition: 'background 0.2s',
                      }} />
                      <span style={{
                        flex: 1, color: textColour,
                        fontWeight: state.status === 'loading' ? 600 : 400,
                      }}>
                        {name}
                      </span>
                      <span style={{
                        fontSize: 10, fontFamily: 'monospace',
                        color: state.status === 'done' ? colours.green : mutedColour,
                        minWidth: 50, textAlign: 'right',
                      }}>
                        {state.status === 'done' && duration !== null
                          ? `${duration}ms`
                          : state.status === 'loading'
                            ? '…'
                            : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeBootMonitor;
