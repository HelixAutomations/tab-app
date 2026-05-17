/**
 * `getApiUrl(path)` — same-origin API URL builder.
 *
 * Use this for any route that lives on **our own Express server**
 * (`server/routes/...`). The Express server already serves the SPA, so calls
 * are same-origin in staging + production and the dev CRA proxy
 * (`src/setupProxy.js`) handles localhost.
 *
 * @example
 *   const url = getApiUrl(`/api/claimEnquiry`);             // → /api/claimEnquiry on dev, https://app.helix-law.../api/claimEnquiry in prod
 *   const url = getApiUrl(`/api/dubberCalls/${id}/transcript`);
 */

interface LocationLike {
    hostname: string;
    origin: string;
}

function resolveLocation(loc?: LocationLike): LocationLike | undefined {
    if (loc) return loc;
    if (typeof window === "undefined") return undefined;
    return window.location;
}

export function getApiUrl(path: string, loc?: LocationLike): string {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    const location = resolveLocation(loc);
    if (!location) return normalised;
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        // Relative URL → setupProxy.js / CRA dev server / Teams toolkit handle it.
        return normalised;
    }
    // Staging + prod: SPA + API are same-origin.
    return `${location.origin}${normalised}`;
}

/**
 * `getApiBase()` — same-origin API base (no path).
 *
 * Use when existing code already builds the path inline as `${base}/api/foo`.
 * Returns `''` (empty string → relative URL) on localhost so the CRA dev proxy
 * still handles it, and `window.location.origin` in staging/prod.
 *
 * The optional `loc` argument exists only to keep the helper test-friendly
 * without monkey-patching jsdom's read-only `window.location`. Production
 * callers should always invoke it zero-arg.
 */
export function getApiBase(loc?: LocationLike): string {
    const location = resolveLocation(loc);
    if (!location) return '';
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '';
    return location.origin;
}

export default getApiUrl;
