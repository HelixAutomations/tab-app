// src/components/demoCheatSheetOverrides.ts
//
// Override layer for the presenter cheat sheet (Ctrl+Shift+D).
// Lets LZ rename sections, reorder/add/remove action points live during a
// rehearsal session — without redeploying — and have those edits survive
// reload. Per-presenter, stored in localStorage first and synced to Express.
//
// Design rules:
//   • Seed data in `demoCheatSheet.data.ts` is canonical and never mutated.
//   • Overrides are sparse: only fields the user touched are stored.
//   • List fields (notes / approachLZWhen / crossApp) are replaced wholesale
//     when present (simpler than per-item patching, avoids stale ids).
//   • Schema versioned so future shape changes can migrate forward.
//   • Server sync is best-effort; localStorage remains the offline fallback.

import type { DemoSection, ReadinessTier } from './demoCheatSheet.data';

const STORAGE_KEY = 'helix.demoCheatSheet.overrides.v1';
const LOCAL_EXPRESS_ORIGIN = 'http://localhost:8080';
const DEMO_API_TIMEOUT_MS = 2500;

export type SectionOverride = {
  title?: string;
  readiness?: ReadinessTier | null; // null = explicitly cleared
  basicNotes?: string[];
  notes?: string[];
  approachLZWhen?: string[];
  crossApp?: string[];
};

export type Overrides = {
  schema: 1;
  sections: Record<string, SectionOverride>;
};

const EMPTY: Overrides = { schema: 1, sections: {} };

function safeParse(raw: string | null): Overrides {
  if (!raw) return { ...EMPTY, sections: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY, sections: {} };
    if (parsed.schema !== 1 || typeof parsed.sections !== 'object' || !parsed.sections) {
      return { ...EMPTY, sections: {} };
    }
    return { schema: 1, sections: parsed.sections as Record<string, SectionOverride> };
  } catch {
    return { ...EMPTY, sections: {} };
  }
}

export function loadOverrides(): Overrides {
  if (typeof window === 'undefined') return { ...EMPTY, sections: {} };
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY, sections: {} };
  }
}

export function saveOverrides(next: Overrides): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / disabled storage — silently ignore; UI will still work in-memory.
  }
}

/** Apply overrides to a single seed section. Returns a new object. */
export function mergeSection(seed: DemoSection, ov: SectionOverride | undefined): DemoSection {
  if (!ov) return seed;
  const merged: DemoSection = { ...seed };
  if (typeof ov.title === 'string' && ov.title.trim()) merged.title = ov.title;
  if (ov.readiness === null) {
    delete merged.readiness;
  } else if (ov.readiness) {
    merged.readiness = ov.readiness;
  }
  if (Array.isArray(ov.basicNotes)) merged.basicNotes = ov.basicNotes.slice();
  if (Array.isArray(ov.notes)) merged.notes = ov.notes.slice();
  if (Array.isArray(ov.approachLZWhen)) merged.approachLZWhen = ov.approachLZWhen.slice();
  if (Array.isArray(ov.crossApp)) merged.crossApp = ov.crossApp.slice();
  return merged;
}

export function applyOverrides(seed: DemoSection[], overrides: Overrides): DemoSection[] {
  return seed.map((s) => mergeSection(s, overrides.sections[s.id]));
}

/** Patch a single section's override and persist. Returns the new Overrides. */
export function patchSectionOverride(
  current: Overrides,
  sectionId: string,
  patch: SectionOverride,
): Overrides {
  const existing = current.sections[sectionId] || {};
  const nextSection: SectionOverride = { ...existing, ...patch };
  // Strip undefined keys so the saved object stays sparse.
  (Object.keys(nextSection) as (keyof SectionOverride)[]).forEach((k) => {
    if (nextSection[k] === undefined) delete nextSection[k];
  });
  const next: Overrides = {
    schema: 1,
    sections: { ...current.sections, [sectionId]: nextSection },
  };
  saveOverrides(next);
  return next;
}

export function resetSectionOverride(current: Overrides, sectionId: string): Overrides {
  if (!current.sections[sectionId]) return current;
  const nextSections = { ...current.sections };
  delete nextSections[sectionId];
  const next: Overrides = { schema: 1, sections: nextSections };
  saveOverrides(next);
  return next;
}

export function hasSectionOverride(current: Overrides, sectionId: string): boolean {
  const s = current.sections[sectionId];
  if (!s) return false;
  return Object.keys(s).length > 0;
}

// ── Server sync ─────────────────────────────────────────────────────────
// Cross-machine persistence backed by `data/demo-cheat-sheet-overrides.json`.
// Local store remains the offline fallback / first paint.

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local-only' | 'error';

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function demoApiCandidates(path: string): string[] {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return [normalised];
  const { hostname, port, origin } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalhost) return [`${origin}${normalised}`];

  const backendOrigin = hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8080'
    : LOCAL_EXPRESS_ORIGIN;

  if (port === '8080') return [normalised];
  // For this tiny dev-only route, prefer the real Express backend on local
  // origins. CRA proxy is a fallback, not the first hop, because a stalled
  // proxy candidate makes the Done button sit on "Saving…" with no backend log.
  if (port === '3000') return unique([`${backendOrigin}${normalised}`, normalised]);
  return unique([`${backendOrigin}${normalised}`, normalised]);
}

async function fetchDemoApi(url: string, init?: RequestInit): Promise<Response> {
  if (typeof AbortController === 'undefined') {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEMO_API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch overrides for a presenter from the server. Returns null on failure. */
export async function fetchOverridesFromServer(presenter: string): Promise<Overrides | null> {
  if (!presenter) return null;
  const path = `/api/demo-cheat-sheet/overrides?presenter=${encodeURIComponent(presenter)}`;
  for (const url of demoApiCandidates(path)) {
    try {
      const res = await fetchDemoApi(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || data.schema !== 1 || typeof data.sections !== 'object') continue;
      return { schema: 1, sections: data.sections as Record<string, SectionOverride> };
    } catch {
      // Try the next candidate; local ad-hoc origins may not proxy /api.
    }
  }
  return null;
}

/** Push overrides to the server. Mutations are LZ-only on the server side. */
export async function pushOverridesToServer(
  presenter: string,
  requesterInitials: string,
  next: Overrides,
): Promise<boolean> {
  if (!presenter || !requesterInitials) return false;
  const body = JSON.stringify({
    requesterInitials,
    presenter,
    overrides: next,
  });
  for (const url of demoApiCandidates('/api/demo-cheat-sheet/overrides')) {
    try {
      const res = await fetchDemoApi(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
      });
      if (!res.ok) continue;
      const data = await res.clone().json().catch(() => null);
      if (data?.schema === 1 && typeof data.sections === 'object') return true;
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}
