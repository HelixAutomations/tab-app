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
}

if (typeof window !== 'undefined' && (window as any).fetch) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method || 'GET';
        const start = performance.now();
        try {
            const response = await originalFetch(input as any, init);
            push({ url, method, status: response.status, durationMs: performance.now() - start });
            return response;
        } catch (err) {
            push({ url, method, status: undefined, durationMs: performance.now() - start });
            throw err;
        }
    };
}

if (typeof window !== 'undefined' && (window as any).XMLHttpRequest) {
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
        this.addEventListener('loadend', function (this: XMLHttpRequest) {
            push({ url: info.url, method: info.method, status: this.status, durationMs: performance.now() - start });
        });
        return origSend.call(this, body);
    };
}

export function getCallLogs(): CallLogEntry[] {
    return callLogs;
}

export function clearCallLogs() {
    callLogs.length = 0;
    persist();
}
