import { getProxyBaseUrl } from "../getProxyBaseUrl";

const DEFAULT_PROXY_BASE_URL = "https://helix-keys-proxy.azurewebsites.net/api";

describe("getProxyBaseUrl", () => {
    const originalEnv = process.env.REACT_APP_PROXY_BASE_URL;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.REACT_APP_PROXY_BASE_URL = originalEnv;
        process.env.NODE_ENV = originalNodeEnv;
    });

    it("uses env url in development when provided and not the CRA dev port", () => {
        // The dev branch only honours an explicit non-3001 envUrl. When the
        // operator points the SPA at a different backend port (e.g. an
        // alternative `start:server` port), it must be used verbatim.
        process.env.NODE_ENV = "development";
        process.env.REACT_APP_PROXY_BASE_URL = "http://localhost:8080";
        expect(getProxyBaseUrl()).toBe("http://localhost:8080");
    });

    it("returns empty string in development when env url missing (setupProxy.js handles routing)", () => {
        // Important: when no env URL is set, the helper returns "" so calls
        // resolve relative and `src/setupProxy.js` forwards them to the local
        // Express server. Returning DEFAULT_PROXY_BASE_URL here would mean the
        // dev SPA hits the staging proxy — which was the source of the
        // `/api/api/` 404 class fixed in Phase 1b.
        process.env.NODE_ENV = "development";
        delete process.env.REACT_APP_PROXY_BASE_URL;
        expect(getProxyBaseUrl()).toBe("");
    });

    it("returns empty string in development when env url is the CRA dev port (setupProxy.js handles it)", () => {
        process.env.NODE_ENV = "development";
        process.env.REACT_APP_PROXY_BASE_URL = "http://localhost:3001";
        expect(getProxyBaseUrl()).toBe("");
    });

    it("ignores localhost env url in production", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "http://localhost:8080";
        expect(getProxyBaseUrl()).toBe(DEFAULT_PROXY_BASE_URL);
    });

    it("uses env url when non-local in production", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "https://api.example.com";
        expect(getProxyBaseUrl()).toBe("https://api.example.com");
    });

    it("allows api segment if provided", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "https://api.example.com/api";
        expect(getProxyBaseUrl()).toBe("https://api.example.com/api");
    });
});
