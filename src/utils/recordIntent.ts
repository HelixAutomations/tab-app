/**
 * Form intent beacon.
 *
 * Operator god-mode P1.
 * Brief: docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md
 *
 * Why
 *   Fire a `/api/forms/intent` record the INSTANT the user presses submit
 *   on any Helix form, BEFORE the real submission POST is issued. If the
 *   real POST never lands (network blip, crash, browser close), the orphan
 *   intent surfaces in the System tab so the user's action is never
 *   silently lost.
 *
 * Usage
 *   const clientSubmissionId = await recordIntent({ formKey: 'undertaking', payload });
 *   // include clientSubmissionId in the real POST body so the server can
 *   // back-link the intent to the resulting form_submissions row.
 *
 * Failure model
 *   Best-effort. Never throws. Returns a clientSubmissionId in every case
 *   (even when the beacon POST fails) so the caller can still attach it to
 *   the real submission.
 */

export interface RecordIntentArgs {
  formKey: string;
  payload?: unknown;
  /** Defaults to window.location.pathname. */
  route?: string;
}

function generateClientSubmissionId(): string {
  try {
    const c = typeof crypto !== 'undefined' ? crypto : undefined;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through to non-crypto fallback
  }
  return `int-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fingerprintPayload(payload: unknown): Promise<string | null> {
  if (payload == null) return null;
  let json: string;
  try {
    json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return null;
  }
  try {
    const c = typeof crypto !== 'undefined' ? crypto : undefined;
    if (c?.subtle?.digest) {
      const data = new TextEncoder().encode(json);
      const hash = await c.subtle.digest('SHA-256', data);
      const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hex}`;
    }
  } catch {
    // fall through
  }
  // Cheap fallback: length + naive checksum. Better than nothing.
  let sum = 0;
  for (let i = 0; i < json.length; i++) sum = (sum * 31 + json.charCodeAt(i)) | 0;
  return `len:${json.length}:sum:${(sum >>> 0).toString(16)}`;
}

function beacon(body: string): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon('/api/forms/intent', blob);
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Record a form-submission intent. Returns the generated clientSubmissionId
 * which the caller MUST forward in the real submission POST body so the
 * server can back-link the two rows.
 */
export async function recordIntent({ formKey, payload, route }: RecordIntentArgs): Promise<string> {
  const clientSubmissionId = generateClientSubmissionId();
  if (typeof window === 'undefined') return clientSubmissionId;

  const fingerprint = await fingerprintPayload(payload);
  const body = JSON.stringify({
    clientSubmissionId,
    formKey,
    payloadFingerprint: fingerprint,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    route: route || (typeof window !== 'undefined' ? window.location?.pathname : null),
  });

  try {
    const res = await fetch('/api/forms/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      // fall through to beacon as a last-ditch attempt
      beacon(body);
    }
  } catch {
    beacon(body);
  }

  return clientSubmissionId;
}

export default recordIntent;
