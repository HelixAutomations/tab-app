import { useCallback, useEffect, useRef, useState } from 'react';

export type HomeMetricName = 'transactions' | 'futureBookings' | 'outstandingBalances';

export interface HomeMetricEvent {
  type: 'init' | 'metric-complete' | 'metric-error' | 'complete';
  metric?: HomeMetricName;
  status?: 'loading' | 'ready' | 'error';
  data?: unknown;
  cached?: boolean;
  error?: string;
  metrics?: { name: HomeMetricName; status: 'loading' }[];
}

interface UseHomeMetricsStreamOptions {
  autoStart?: boolean;
  metrics?: HomeMetricName[];
  bypassCache?: boolean;
  onMetric?: (name: HomeMetricName, data: unknown, cached: boolean) => void;
  onError?: (name: HomeMetricName | 'stream', error: string) => void;
  onComplete?: () => void;
}

export function useHomeMetricsStream(opts: UseHomeMetricsStreamOptions = {}) {
  const { autoStart = true, metrics, bypassCache = false, onMetric, onError, onComplete } = opts;
  const sourceRef = useRef<EventSource | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Keep the latest callbacks in refs so start() doesn't change identity on each render
  const onMetricRef = useRef<typeof onMetric>();
  const onErrorRef = useRef<typeof onError>();
  const onCompleteRef = useRef<typeof onComplete>();
  const lastErrorAtRef = useRef<number>(0);

  useEffect(() => { onMetricRef.current = onMetric; }, [onMetric]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const start = useCallback(() => {
    if (sourceRef.current) return; // already started
    const metricParam = (metrics && metrics.length ? metrics : undefined)?.join(',');
    const params = new URLSearchParams();
    if (metricParam) params.set('metrics', metricParam);
    if (bypassCache) params.set('bypassCache', 'true');
    const url = `/api/home-metrics/stream?${params.toString()}`;

    const es = new EventSource(url);
    sourceRef.current = es;
    setIsStreaming(true);

    es.onmessage = (evt) => {
      try {
        const parsed: HomeMetricEvent = JSON.parse(evt.data);
        if (parsed.type === 'metric-complete' && parsed.metric) {
          onMetricRef.current?.(parsed.metric as HomeMetricName, parsed.data, !!parsed.cached);
        } else if (parsed.type === 'metric-error') {
          onErrorRef.current?.(parsed.metric as HomeMetricName, parsed.error || 'unknown error');
        } else if (parsed.type === 'complete') {
          onCompleteRef.current?.();
          // Allow the server to finish naturally; we'll close on unmount or explicit stop
          stop();
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // Throttle error notifications to avoid log spam; let EventSource retry automatically
      const now = Date.now();
      if (now - lastErrorAtRef.current > 5000) {
        lastErrorAtRef.current = now;
        onErrorRef.current?.('stream', 'EventSource error');
      }
      // Do NOT call stop() here; keep the EventSource open so built-in retry/backoff applies
    };
  }, [bypassCache, Array.isArray(metrics) ? metrics.join(',') : '']);

  const stop = useCallback(() => {
    const es = sourceRef.current;
    if (es) {
      try { es.close(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (autoStart) start();
    return () => { stop(); };
    // Intentionally exclude onMetric/onError/onComplete from deps to avoid restart loops
  }, [autoStart, start, stop]);

  return { start, stop, isStreaming };
}

export default useHomeMetricsStream;
