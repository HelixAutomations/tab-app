const DEFAULT_PROXY_BASE_URL =
    "https://helix-keys-proxy.azurewebsites.net/api";

export function getProxyBaseUrl(): string {
    const envUrl = process.env.REACT_APP_PROXY_BASE_URL;
    const nodeEnv = process.env.NODE_ENV;
    // If running in browser on localhost, always use relative URLs (prefer local server)
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return "";
        }
    }

    // In development, check if we should use setupProxy.js routing
    if (nodeEnv === "development") {
        // If envUrl is explicitly empty or localhost:3001, use relative paths for setupProxy.js
        if (envUrl === "" || !envUrl || envUrl.includes("localhost:3001")) {
            return ""; // Use relative URLs to enable setupProxy.js routing
        }
        return envUrl || DEFAULT_PROXY_BASE_URL;
    }

    // In production only honor env values that aren't pointing at localhost.
    if (envUrl && !/localhost|127\.0\.0\.1/.test(envUrl)) {
        return envUrl;
    }

    // Fallback to the default production URL
    return DEFAULT_PROXY_BASE_URL;
}

export default getProxyBaseUrl;