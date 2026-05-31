export type ProcessStreamLane = 'Start' | 'Request' | 'Log' | 'Escalate' | 'Find';

export type RecordProcessEventArgs = {
  formKey: string;
  lane?: ProcessStreamLane;
  summary: string;
  eventName?: string;
  initials?: string | null;
  source?: string;
  payload?: Record<string, unknown>;
  stepStatus?: 'success' | 'failed';
  error?: string;
};

export async function recordProcessEvent({
  formKey,
  lane = 'Log',
  summary,
  eventName = 'process.event',
  initials,
  source = 'hub',
  payload,
  stepStatus = 'success',
  error,
}: RecordProcessEventArgs): Promise<void> {
  try {
    await fetch('/api/process-hub/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        formKey,
        lane,
        summary,
        eventName,
        initials,
        source,
        payload,
        stepStatus,
        error,
        route: typeof window !== 'undefined' ? window.location?.pathname : null,
      }),
    });
  } catch {
    // Best-effort visibility only. User actions must never fail because the stream is unavailable.
  }
}

export default recordProcessEvent;