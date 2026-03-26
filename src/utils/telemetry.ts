type TelemetryData = Record<string, unknown>;

interface TrackOptions {
  duration?: number;
  error?: string;
  throttleKey?: string;
  cooldownMs?: number;
}

const SESSION_KEY = '__helixTelemetrySessionId';
const lastSentAt = new Map<string, number>();
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g;

function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `sess-${Date.now()}`;
  }
}

function shouldSend(throttleKey?: string, cooldownMs = 0): boolean {
  if (!throttleKey || cooldownMs <= 0) return true;
  const now = Date.now();
  const last = lastSentAt.get(throttleKey) || 0;
  if (now - last < cooldownMs) return false;
  lastSentAt.set(throttleKey, now);
  return true;
}

function sanitizeString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(LONG_NUMBER_PATTERN, '[redacted-number]')
    .slice(0, 240);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (depth >= 1) return `[array:${value.length}]`;
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 1) return '[object]';
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('email') ||
        lowerKey.includes('phone') ||
        lowerKey.includes('name') ||
        lowerKey.includes('address') ||
        lowerKey.includes('dob') ||
        lowerKey.includes('birth') ||
        lowerKey.includes('instruction') ||
        lowerKey.includes('prospect') ||
        lowerKey.includes('clientid') ||
        lowerKey.includes('matterid') ||
        lowerKey.includes('enquiryid') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('auth')
      ) {
        result[key] = '[redacted]';
        continue;
      }
      result[key] = sanitizeValue(nested, depth + 1);
    }
    return result;
  }
  return String(value);
}

function normalizePath(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl, window.location.origin);
    return url.pathname;
  } catch {
    return sanitizeString(pathOrUrl);
  }
}

function send(payload: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Telemetry is best-effort only.
  });
}

export function trackClientEvent(source: string, type: string, data: TelemetryData = {}, opts: TrackOptions = {}) {
  if (!shouldSend(opts.throttleKey, opts.cooldownMs)) return;

  const normalizedData: TelemetryData = { ...data };
  if (typeof normalizedData.path === 'string') {
    normalizedData.path = normalizePath(normalizedData.path);
  }

  send({
    source,
    event: {
      type,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      data: sanitizeValue(normalizedData),
      duration: Number.isFinite(opts.duration) ? Number(opts.duration) : undefined,
      error: opts.error ? sanitizeString(opts.error) : undefined,
    },
  });
}

export function trackClientError(source: string, type: string, error: unknown, data: TelemetryData = {}, opts: Omit<TrackOptions, 'error'> = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  trackClientEvent(source, type, data, { ...opts, error: message });
}
