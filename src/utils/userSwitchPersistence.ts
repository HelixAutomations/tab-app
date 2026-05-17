// Persistence for in-session user switches via the UserBubble picker.
// A reload-based switch beats trying to invalidate every keep-alive tab and SSE
// stream piecemeal — but the chosen identity must survive the reload, otherwise
// the boot path re-derives the original principal and the switch is undone.

const KEY = '__helix_user_switch_v1';

export interface PersistedUserSwitch {
  switched: any;
  original: any | null;
  ts: number;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function persistUserSwitch(switched: any, original: any | null): void {
  const s = storage();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify({ switched, original, ts: Date.now() })); } catch {}
}

export function readUserSwitch(): PersistedUserSwitch | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.switched) return null;
    return parsed as PersistedUserSwitch;
  } catch { return null; }
}

export function clearUserSwitch(): void {
  const s = storage();
  if (!s) return;
  try { s.removeItem(KEY); } catch {}
}
