/**
 * Wayfinding — thin browser-side helpers that make the running app
 * inspectable by humans AND by AI agents looking at a screenshot or DOM
 * snapshot of the live window.
 *
 * Concepts:
 *
 *   1. `data-helix-region` attributes
 *      Every "addressable" surface in the UI carries a stable, dot-delimited
 *      region name (e.g. `app/root`, `home/calls-and-notes`, `matter/<id>`).
 *      An agent or operator can use these to point at things ("click on
 *      `home/calls-and-notes`") without relying on brittle CSS selectors.
 *
 *   2. `window.__helix__` debug API
 *      Exposed in dev only. Lets the agent (or you, in DevTools) ask:
 *        - what regions are mounted right now?
 *        - what's the active tab / user tier / build id?
 *
 *   3. `<html data-helix-build="...">`
 *      Stamped at boot so a screenshot or page source includes the build id
 *      and timestamp the user is currently seeing. Surfaces in prod too —
 *      it's inert and harmless.
 *
 * Wayfinding is observation-only. Nothing here mutates app state. Adding a
 * region attribute to a new component is the standard way to make it
 * agent-discoverable (see `.github/instructions/wayfinding.instructions.md`).
 */

const isDev = process.env.NODE_ENV !== 'production';

interface RegionDescriptor {
  name: string;
  /** Path within the document — useful for nested regions. */
  ancestors: string[];
  /** Bounding box (rounded) so an agent can correlate with a screenshot. */
  rect: { x: number; y: number; width: number; height: number };
  /** Whether the region is on-screen right now. */
  visible: boolean;
}

function describeRegion(el: HTMLElement): RegionDescriptor {
  const name = el.dataset.helixRegion || 'unknown';
  const ancestors: string[] = [];
  let cursor: HTMLElement | null = el.parentElement;
  while (cursor) {
    if (cursor.dataset && cursor.dataset.helixRegion) {
      ancestors.unshift(cursor.dataset.helixRegion);
    }
    cursor = cursor.parentElement;
  }
  const r = el.getBoundingClientRect();
  return {
    name,
    ancestors,
    rect: {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
    visible:
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight &&
      r.left < window.innerWidth,
  };
}

function listRegions(): RegionDescriptor[] {
  if (typeof document === 'undefined') return [];
  const nodes = document.querySelectorAll<HTMLElement>('[data-helix-region]');
  return Array.from(nodes).map(describeRegion);
}

/**
 * Stamp the build id + boot timestamp on `<html>` so every screenshot or
 * page-source dump includes which version of the app is running.
 * Safe to call in production — the attribute is inert.
 */
export function stampBuildAttribute(): void {
  if (typeof document === 'undefined') return;
  const sha =
    (typeof process !== 'undefined' && process.env.REACT_APP_BUILD_SHA) ||
    'dev';
  const ts = new Date().toISOString();
  document.documentElement.setAttribute('data-helix-build', `${sha}@${ts}`);
  // Seed a region on #root so the overlay always has something to anchor to.
  const root = document.getElementById('root');
  if (root && !root.dataset.helixRegion) {
    root.dataset.helixRegion = 'app/root';
  }
}

/**
 * Register `window.__helix__` in dev. Provides:
 *   - regions(): list every mounted region with name, ancestors, rect, visibility
 *   - currentRegion(selector?): describe the topmost region under the cursor
 *     or matching `selector`
 *   - build(): the build attribute stamped on <html>
 *   - tabs(): list of mounted tab regions (anything matching `tab/*`)
 *
 * Production safety: only registered when NODE_ENV !== 'production'.
 */
export function registerWayfindingDebugApi(): void {
  if (!isDev || typeof window === 'undefined') return;
  (window as any).__helix__ = {
    regions: listRegions,
    currentRegion(selector?: string): RegionDescriptor | null {
      if (selector) {
        const el = document.querySelector<HTMLElement>(selector);
        return el && el.dataset.helixRegion ? describeRegion(el) : null;
      }
      // No selector: pick the topmost visible region, narrowest first.
      const all = listRegions().filter((r) => r.visible);
      all.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
      return all[0] || null;
    },
    tabs(): RegionDescriptor[] {
      return listRegions().filter((r) => r.name.startsWith('tab/'));
    },
    build(): string | null {
      return document.documentElement.getAttribute('data-helix-build');
    },
    help(): string {
      return [
        'window.__helix__ — wayfinding helpers (dev only)',
        '  .regions()         all mounted regions',
        '  .currentRegion()   topmost visible region',
        '  .tabs()            mounted tab regions',
        '  .build()           build id stamped at boot',
        'Toggle wayfinding overlay: Ctrl+Shift+H',
      ].join('\n');
    },
  };
}
