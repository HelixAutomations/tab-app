import { getProxyBaseUrl } from "../getProxyBaseUrl";

const DEFAULT_PROXY_BASE_URL = "https://helix-keys-proxy.azurewebsites.net/api";

describe("getProxyBaseUrl", () => {
    const originalEnv = process.env.REACT_APP_PROXY_BASE_URL;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.REACT_APP_PROXY_BASE_URL = originalEnv;
        process.env.NODE_ENV = originalNodeEnv;
    });

    it("uses env url in development when provided", () => {
        process.env.NODE_ENV = "development";
        process.env.REACT_APP_PROXY_BASE_URL = "http://localhost:8080";
        expect(getProxyBaseUrl()).toBe("http://localhost:8080/api");
    });

    it("defaults to local proxy in development when env url missing", () => {
        process.env.NODE_ENV = "development";
        delete process.env.REACT_APP_PROXY_BASE_URL;
        expect(getProxyBaseUrl()).toBe("http://localhost:8080/api");
    });

    it("ignores localhost env url in production", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "http://localhost:8080";
        expect(getProxyBaseUrl()).toBe(DEFAULT_PROXY_BASE_URL);
    });

    it("uses env url when non-local in production and normalizes path", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "https://api.example.com";
        expect(getProxyBaseUrl()).toBe("https://api.example.com/api");
    });

    it("does not duplicate api segment", () => {
        process.env.NODE_ENV = "production";
        process.env.REACT_APP_PROXY_BASE_URL = "https://api.example.com/api";
        expect(getProxyBaseUrl()).toBe("https://api.example.com/api");
    });
});
