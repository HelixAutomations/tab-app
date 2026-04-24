import { trackClientError, trackClientEvent } from './telemetry';
import {
    appendRequestAuthQueryParams,
    buildRequestAuthHeaders,
    shouldAugmentApiRequest,
} from './requestAuthContext';

export interface CallLogEntry {
    url: string;
    method: string;
    status?: number;
    durationMs: number;
}

const storageKey = '__appCallLogs';
const callLogs: CallLogEntry[] = (() => {
    try {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
})();

function persist() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(callLogs));
    } catch {
        /* ignore */
    }
}

function push(entry: CallLogEntry) {
    callLogs.push(entry);
    persist();

    let path = entry.url;
    try {
        path = new URL(entry.url, window.location.origin).pathname;
    } catch {
        path = entry.url;
    }

    if (path === '/api/telemetry') {
        return;
    }

    if (entry.status == null || entry.status >= 500) {
        trackClientError('Network', 'request-failed', `${entry.method} ${path} failed`, {
            path,
            method: entry.method,
            status: entry.status ?? 'network-error',
        }, {
            duration: entry.durationMs,
            throttleKey: `network-failed:${entry.method}:${path}:${entry.status ?? 'network'}`,
            cooldownMs: 5000,
        });
        return;
    }

    if (entry.durationMs >= 1500) {
        trackClientEvent('Network', 'request-slow', {
            path,
            method: entry.method,
            status: entry.status,
        }, {
            duration: entry.durationMs,
            throttleKey: `network-slow:${entry.method}:${path}`,
            cooldownMs: 30000,
        });
    }
}

if (typeof window !== 'undefined' && !(window as any).__helixCallLoggerInstalled) {
    (window as any).__helixCallLoggerInstalled = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === 'string'
            ? input
            : input instanceof Request
                ? input.url
                : input.toString();
        const url = shouldAugmentApiRequest(rawUrl)
            ? appendRequestAuthQueryParams(rawUrl)
            : rawUrl;
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        const start = performance.now();

        let nextInput: RequestInfo | URL = input;
        let nextInit = init;

        if (shouldAugmentApiRequest(rawUrl)) {
            const baseHeaders = init?.headers || (input instanceof Request ? input.headers : undefined);
            const headers = buildRequestAuthHeaders(baseHeaders);
            nextInit = {
                ...init,
                headers,
            };

            if (input instanceof Request) {
                nextInput = new Request(url, new Request(input, {
                    ...nextInit,
                    headers,
                }));
            } else {
                nextInput = url;
            }
        }

        try {
            const response = await originalFetch(nextInput as any, nextInit);
            push({ url, method, status: response.status, durationMs: performance.now() - start });
            return response;
        } catch (err) {
            push({ url, method, status: undefined, durationMs: performance.now() - start });
            throw err;
        }
    };
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        method: string,
        url: string,
        ...args: any[]
    ) {
        (this as any).__logInfo = { method, url };
        return origOpen.apply(this, [method, url, ...args] as any);
    };

    XMLHttpRequest.prototype.send = function (
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null
    ) {
        const info = (this as any).__logInfo || { method: 'GET', url: '' };
        const start = performance.now();
        if (shouldAugmentApiRequest(info.url)) {
            const headers = buildRequestAuthHeaders();
            headers.forEach((value, key) => {
                try {
                    this.setRequestHeader(key, value);
                } catch {
                    // ignore header injection failures for opaque XHR callers
                }
            });
        }
        this.addEventListener('loadend', function (this: XMLHttpRequest) {
            push({ url: info.url, method: info.method, status: this.status, durationMs: performance.now() - start });
        });
        return origSend.call(this, body);
    };

    const NativeEventSource = window.EventSource;
    class AuthenticatedEventSource extends NativeEventSource {
        constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
            super(appendRequestAuthQueryParams(url), eventSourceInitDict);
        }
    }

    Object.defineProperties(AuthenticatedEventSource, {
        CONNECTING: { value: NativeEventSource.CONNECTING },
        OPEN: { value: NativeEventSource.OPEN },
        CLOSED: { value: NativeEventSource.CLOSED },
    });

    window.EventSource = AuthenticatedEventSource as typeof EventSource;
}

export function getCallLogs(): CallLogEntry[] {
    return callLogs;
}

export function clearCallLogs() {
    callLogs.length = 0;
    persist();
}
