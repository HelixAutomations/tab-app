/**
 * DebugLatencyOverlay — dev-only diagnostic strip for the UX Realtime Navigation Programme (Phase 0).
 *
 * Renders a compact, fixed-position pill in the bottom-right that lists the most
 * recent interaction durations captured by `interactionTracker`. Gated by the
 * caller (only rendered for `canSeePrivateHubControls()` users in App.tsx).
 *
 * Activation:
 *   - Caller passes `enabled` based on `canSeePrivateHubControls(user)`.
 *   - Auto-shows when the URL contains `?ux-debug=1` OR `localStorage.helixUxDebug === '1'`.
 *   - Click the pill to expand a per-name p50/p95 breakdown; click again to collapse.
 *   - Press the small `×` to dismiss for the current session.
 *
 * Zero impact for non-admin users — the parent gate ensures it never mounts.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { colours } from '../app/styles/colours';
import {
  getRecentInteractions,
  getStats,
  subscribeInteractions,
  type InteractionRecord,
} from '../utils/interactionTracker';

interface DebugLatencyOverlayProps {
  /** Caller-controlled gate (LZ/AC + dev preview). */
  enabled: boolean;
  /** Optional bottom offset to clear other floating UI (e.g. service health banner). */
  bottomOffset?: number;
}

const DISMISS_KEY = '__helixUxDebugDismissed';
const TOGGLE_STORAGE_KEY = 'helixUxDebug';

function isExplicitlyEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ux-debug') === '1') return true;
    return window.localStorage.getItem(TOGGLE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function classifyDuration(ms: number): { color: string; label: string } {
  if (ms < 100) return { color: colours.green, label: 'snappy' };
  if (ms < 250) return { color: colours.blue, label: 'ok' };
  if (ms < 500) return { color: colours.orange, label: 'slow' };
  return { color: colours.cta, label: 'jank' };
}

const DebugLatencyOverlay: React.FC<DebugLatencyOverlayProps> = ({ enabled, bottomOffset = 60 }) => {
  const [records, setRecords] = useState<InteractionRecord[]>(() => getRecentInteractions());
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());
  const [explicit, setExplicit] = useState<boolean>(() => isExplicitlyEnabled());

  useEffect(() => {
    if (!enabled || dismissed) return;
    return subscribeInteractions(setRecords);
  }, [enabled, dismissed]);

  // React to CommandDeck / storage changes so the toggle flips live.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const next = isExplicitlyEnabled();
      setExplicit(next);
      if (next) {
        // Re-enabling clears any session dismissal so the overlay actually re-appears.
        try { window.sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
        setDismissed(false);
      }
    };
    window.addEventListener('helix:uxDebugToggled', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('helix:uxDebugToggled', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const namesByCount = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((r) => counts.set(r.name, (counts.get(r.name) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [records]);

  if (!enabled || dismissed) return null;
  // Explicit opt-in required — previously the overlay auto-showed as soon as the
  // tracker captured any interaction (which is always, after the first nav), so
  // it was permanently on-screen for LZ/AC. Now it only appears when the user
  // ticks "UX latency overlay" in Command Deck (or sets `?ux-debug=1`).
  if (!explicit) return null;

  const lastThree = records.slice(-3).reverse();
  const allStats = getStats();

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-label="UX latency overlay"
      style={{
        position: 'fixed',
        right: 16,
        bottom: bottomOffset,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        background: 'rgba(6, 23, 51, 0.92)',
        color: colours.dark.text,
        border: `1px solid ${colours.dark.borderColor}`,
        borderRadius: 0,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        fontFamily: 'Raleway, sans-serif',
        fontSize: 11,
        lineHeight: 1.4,
        maxWidth: expanded ? 320 : 240,
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: colours.accent,
            font: 'inherit',
            cursor: 'pointer',
            padding: 0,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 600,
          }}
          aria-expanded={expanded}
        >
          UX · {allStats.count} samples · p95 {allStats.p95.toFixed(0)}ms
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss UX overlay for this session"
          title="Dismiss for session"
          style={{
            background: 'transparent',
            border: 'none',
            color: colours.subtleGrey,
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lastThree.length === 0 ? (
          <span style={{ color: colours.subtleGrey, fontStyle: 'italic' }}>
            Waiting for first interaction…
          </span>
        ) : (
          lastThree.map((r, i) => {
            const c = classifyDuration(r.durationMs);
            return (
              <div key={`${r.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ color: c.color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {r.durationMs.toFixed(0)}ms
                </span>
              </div>
            );
          })
        )}
      </div>
      {expanded && namesByCount.length > 0 && (
        <div style={{ marginTop: 4, paddingTop: 6, borderTop: `1px solid ${colours.dark.borderColor}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {namesByCount.slice(0, 8).map((name) => {
            const s = getStats(name);
            const c = classifyDuration(s.p95);
            return (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#d1d5db' }}>{name} · {s.count}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: colours.subtleGrey }}>
                  p50 {s.p50.toFixed(0)} · <span style={{ color: c.color, fontWeight: 600 }}>p95 {s.p95.toFixed(0)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DebugLatencyOverlay;
