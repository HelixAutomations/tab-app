/**
 * useFormReadinessPulse — on-mount readiness probe for bespoke forms.
 *
 * From the brief:
 *   docs/notes/_archive/BESPOKE_FORMS_ON_MOUNT_READINESS_PULSE_UNIVERSAL_PERSISTENCE.md (once shipped)
 *
 * Contract:
 *  • On mount, GET /api/form-health/:formId with a 3s abortable budget.
 *  • Guarantees minimum ~400ms in 'checking' so the animation actually reads.
 *  • Maps a successful response whose body reports status === 'healthy' to 'ready'.
 *  • Anything else (non-OK, body status !== 'healthy', timeout, network error) → 'degraded'.
 *  • No retries. The cue is reassurance, never a blocker.
 *  • `REACT_APP_DISABLE_FORM_READINESS_PULSE=true` or an empty `formId` → 'idle'.
 */
import { useEffect, useRef, useState } from 'react';

export type FormReadinessState = 'idle' | 'checking' | 'ready' | 'degraded';

export interface FormReadiness {
  state: FormReadinessState;
  detail?: string;
}

const MIN_CHECKING_MS = 400;
const TIMEOUT_MS = 3000;

export function useFormReadinessPulse(formId: string | null | undefined): FormReadiness {
  const [readiness, setReadiness] = useState<FormReadiness>({
    state: formId ? 'checking' : 'idle',
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!formId) {
      setReadiness({ state: 'idle' });
      return () => {
        mountedRef.current = false;
      };
    }

    if (
      typeof process !== 'undefined' &&
      process.env &&
      String(process.env.REACT_APP_DISABLE_FORM_READINESS_PULSE || '').toLowerCase() === 'true'
    ) {
      setReadiness({ state: 'idle' });
      return () => {
        mountedRef.current = false;
      };
    }

    setReadiness({ state: 'checking' });

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    const settle = (next: FormReadiness) => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_CHECKING_MS - elapsed);
      window.setTimeout(() => {
        if (mountedRef.current) setReadiness(next);
      }, wait);
    };

    fetch(`/api/form-health/${encodeURIComponent(formId)}`, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) {
          settle({ state: 'degraded', detail: `HTTP ${res.status}` });
          return;
        }
        try {
          const body = await res.json();
          if (body && body.status === 'healthy') {
            settle({ state: 'ready' });
          } else {
            settle({
              state: 'degraded',
              detail:
                (body && (body.error || body.status)) ||
                'Endpoint reported a degraded state',
            });
          }
        } catch {
          settle({ state: 'degraded', detail: 'Unexpected response' });
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          settle({ state: 'degraded', detail: 'Probe timed out' });
        } else {
          settle({ state: 'degraded', detail: err?.message || 'Network error' });
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [formId]);

  return readiness;
}
