/**
 * Tests for `getApiUrl` and `getApiBase` — the same-origin API helpers that
 * replaced `getProxyBaseUrl()` for routes our Express server hosts directly.
 *
 * The legacy `getProxyBaseUrl()` is intentionally kept and tested separately
 * in `getProxyBaseUrl.test.ts` until the remaining Function-fronted routes
 * (snippet edits, getInstructionData, updateTransactions, MattersReport,
 * updateAnnualLeave) are ported per the
 * `retire-helix-keys-proxy-and-add-form-route-preflight` stash brief.
 *
 * The helpers accept an optional `loc` parameter purely for test injection
 * (production callers always invoke zero-arg) — this avoids fighting jsdom's
 * non-configurable `window.location`.
 */

import { getApiUrl, getApiBase } from "../getApiUrl";

const fakeLoc = (href: string) => {
    const u = new URL(href);
    return { hostname: u.hostname, origin: u.origin };
};

describe("getApiUrl", () => {
    it("returns a relative URL on localhost so the CRA dev proxy can route it", () => {
        expect(getApiUrl("/api/foo", fakeLoc("http://localhost:3000/"))).toBe("/api/foo");
    });

    it("returns a relative URL on 127.0.0.1 too", () => {
        expect(getApiUrl("/api/foo", fakeLoc("http://127.0.0.1:3000/"))).toBe("/api/foo");
    });

    it("normalises a missing leading slash", () => {
        expect(getApiUrl("api/foo", fakeLoc("http://localhost:3000/"))).toBe("/api/foo");
    });

    it("returns a same-origin absolute URL in staging", () => {
        expect(
            getApiUrl(
                "/api/dubberCalls/123/transcript",
                fakeLoc("https://app.staging.helix-law.com/tabs"),
            ),
        ).toBe("https://app.staging.helix-law.com/api/dubberCalls/123/transcript");
    });

    it("preserves query strings and path segments verbatim in prod", () => {
        expect(
            getApiUrl("/api/team-lookup?initials=LZ", fakeLoc("https://app.helix-law.com/")),
        ).toBe("https://app.helix-law.com/api/team-lookup?initials=LZ");
    });
});

describe("getApiBase", () => {
    it("returns an empty string on localhost", () => {
        expect(getApiBase(fakeLoc("http://localhost:3000/"))).toBe("");
    });

    it("returns an empty string on 127.0.0.1", () => {
        expect(getApiBase(fakeLoc("http://127.0.0.1:3000/"))).toBe("");
    });

    it("returns the origin in staging/prod", () => {
        expect(getApiBase(fakeLoc("https://app.helix-law.com/tabs/forms"))).toBe(
            "https://app.helix-law.com",
        );
    });

    it("never produces a /api/api/ path when concatenated with /api/foo (prod)", () => {
        // The classic `/api/api/` regression shape — with the legacy proxy
        // (`https://helix-keys-proxy.../api`) this template produced
        // `${proxy}/api/api/foo`. With getApiBase the same template stays
        // single-prefixed.
        const url = `${getApiBase(fakeLoc("https://app.helix-law.com/"))}/api/foo`;
        expect(url).toBe("https://app.helix-law.com/api/foo");
        expect(url).not.toMatch(/\/api\/api\//);
    });

    it("never produces a /api/api/ path on localhost either", () => {
        const url = `${getApiBase(fakeLoc("http://localhost:3000/"))}/api/foo`;
        expect(url).toBe("/api/foo");
        expect(url).not.toMatch(/\/api\/api\//);
    });
});
