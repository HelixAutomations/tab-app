import { useCallback, useEffect, useRef, useState } from 'react';
import { startInteraction } from '../utils/interactionTracker';
import { disposeOnHmr } from '../utils/devHmr';
import { recordReportingDatasetActivity } from '../utils/reportingDatasetActivity';

interface DatasetUpdate {
  type: 'init' | 'dataset-complete' | 'dataset-error' | 'complete';
  dataset?: string;
  status?: 'loading' | 'ready' | 'error';
  data?: any;
  cached?: boolean;
  count?: number;
  error?: string;
  datasets?: Array<{ name: string; status: string }>;
}

interface UseStreamingDatasetsOptions {
  datasets?: string[];
  entraId?: string;
  bypassCache?: boolean;
  autoStart?: boolean;
  maxConcurrent?: number; // Maximum number of datasets to fetch in parallel
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  clientCacheKey?: string;
  reuseCachedSession?: boolean;
}

interface DatasetState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: any;
  cached: boolean;
  count: number;
  error?: string;
  updatedAt?: number;
  elapsedMs?: number;
}

interface UseStreamingDatasetsResult {
  datasets: Record<string, DatasetState>;
  isConnected: boolean;
  isComplete: boolean;
  start: (override?: { datasets?: string[]; bypassCache?: boolean; queryParams?: Record<string, string | number | boolean | null | undefined> }) => void;
  stop: (options?: { resetComplete?: boolean }) => void;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

const streamingDatasetClientCache = new Map<string, Record<string, DatasetState>>();

function hasCompleteCachedSession(cachedStates: Record<string, DatasetState> | null | undefined, datasetNames: string[]): boolean {
  if (!cachedStates || datasetNames.length === 0) return false;
  return datasetNames.every((datasetName) => {
    const cachedState = cachedStates[datasetName];
    return cachedState?.status === 'ready' || cachedState?.status === 'error';
  });
}

function normaliseStreamingQueryParams(source?: Record<string, string | number | boolean | null | undefined>): Record<string, string> {
  const normalised: Record<string, string> = {};
  if (!source) return normalised;
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalised[key] = String(value);
  });
  return normalised;
}

function getStreamingDatasetClientCacheKey(
  clientCacheKey: string | undefined,
  datasetNames: string[],
  queryParams?: Record<string, string | number | boolean | null | undefined>,
): string | null {
  if (!clientCacheKey) return null;
  return `${clientCacheKey}:${datasetNames.join(',')}:${JSON.stringify(normaliseStreamingQueryParams(queryParams))}`;
}

export function useStreamingDatasets(options: UseStreamingDatasetsOptions = {}): UseStreamingDatasetsResult {
  const {
    datasets = ['userData', 'teamData', 'enquiries', 'allMatters', 'wip', 'recoveredFees', 'wipClioCurrentWeek'],
    entraId,
    bypassCache = false,
    autoStart = false,
    maxConcurrent = 3, // Process up to 3 datasets in parallel for optimal performance
    queryParams = {},
    clientCacheKey,
    reuseCachedSession = false,
  } = options;

  const initialClientCacheKey = getStreamingDatasetClientCacheKey(clientCacheKey, datasets, queryParams);
  const initialCachedStates = initialClientCacheKey ? streamingDatasetClientCache.get(initialClientCacheKey) : null;
  const [datasetStates, setDatasetStates] = useState<Record<string, DatasetState>>(() => (initialCachedStates ? { ...initialCachedStates } : {}));
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(() => Boolean(initialCachedStates));
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stop = useCallback((options?: { resetComplete?: boolean }) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    setIsConnected(false);
    if (options?.resetComplete ?? true) {
      setIsComplete(false);
    }
  }, []);

  const start = useCallback((override?: { datasets?: string[]; bypassCache?: boolean; queryParams?: Record<string, string | number | boolean | null | undefined> }) => {
    // Close existing connection first and clear timeouts
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    
    // Build URL with query parameters
    const effectiveDatasets = override?.datasets && override.datasets.length > 0 ? override.datasets : datasets;
    const effectiveBypass = override?.bypassCache ?? bypassCache;
    const overrideQueryParams = override?.queryParams ?? {};
    const mergedQueryParams: Record<string, string> = {};

    const addParams = (source?: Record<string, string | number | boolean | null | undefined>) => {
      if (!source) return;
      Object.entries(source).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        mergedQueryParams[key] = String(value);
      });
    };

    addParams(queryParams);
    addParams(overrideQueryParams);

    const effectiveClientCacheKey = getStreamingDatasetClientCacheKey(clientCacheKey, effectiveDatasets, mergedQueryParams);
    const cachedStates = effectiveClientCacheKey ? streamingDatasetClientCache.get(effectiveClientCacheKey) : null;
    const canReuseCachedSession = reuseCachedSession && !effectiveBypass && hasCompleteCachedSession(cachedStates, effectiveDatasets);

    setDatasetStates(cachedStates ? { ...cachedStates } : {});
    setIsConnected(false);
    setIsComplete(Boolean(cachedStates));

    if (canReuseCachedSession) {
      setIsComplete(true);
      return;
    }

    const url = new URL('/api/reporting-stream/stream-datasets', window.location.origin);
    url.searchParams.set('datasets', effectiveDatasets.join(','));
    if (entraId) {
      url.searchParams.set('entraId', entraId);
    }
    if (effectiveBypass) {
      url.searchParams.set('bypassCache', 'true');
    }
    if (maxConcurrent) {
      url.searchParams.set('maxConcurrent', maxConcurrent.toString());
    }
    Object.entries(mergedQueryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    // Create EventSource connection
    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    // Track timings for a concise summary at the end
    const streamStart = Date.now();
    const starts: Record<string, number> = {};
    const handles: Record<string, ReturnType<typeof startInteraction>> = {};
    let cachedCount = 0;
    let cachedElapsed = 0;
    let freshCount = 0;
    let freshElapsed = 0;

    // Streaming started - progress tracked via datasetStates
    connectTimeoutRef.current = setTimeout(() => {
      if (eventSourceRef.current !== eventSource || eventSource.readyState === EventSource.OPEN) {
        return;
      }
      console.warn('Reporting stream did not open in time - marking datasets as connection errors');
      try { eventSource.close(); } catch { /* ignore */ }
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      setDatasetStates(prev => {
        const next: Record<string, DatasetState> = { ...prev };
        const names = Object.keys(next).length > 0 ? Object.keys(next) : effectiveDatasets;
        names.forEach((dataset) => {
          next[dataset] = {
            ...(next[dataset] ?? { data: null, cached: false, count: 0 }),
            status: 'error',
            error: 'Connection failed before the reporting stream opened',
            updatedAt: Date.now(),
          };
        });
        return next;
      });
      setIsComplete(true);
    }, 12000);

    eventSource.onopen = () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setIsConnected(true);
      setIsComplete(false);
      // Connected to streaming endpoint
      
      // Set a timeout to mark stuck datasets as error after 10 minutes
      timeoutRef.current = setTimeout(() => {
        console.warn('Streaming timeout reached - marking incomplete datasets as error');
        setDatasetStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(dataset => {
            if (next[dataset].status === 'loading') {
              next[dataset] = {
                ...next[dataset],
                status: 'error',
                error: 'Timeout: Dataset took too long to load (>10min)',
                updatedAt: Date.now(),
                elapsedMs: starts[dataset] ? Date.now() - starts[dataset] : undefined,
              };

            }
          });
          return next;
        });
        setIsComplete(true);
        stop();
      }, 600000); // 10 minutes timeout (600 seconds)
    };

    eventSource.onmessage = (event) => {
      try {
        const update: DatasetUpdate = JSON.parse(event.data);

        switch (update.type) {
          case 'init':
            if (update.datasets) {
              setDatasetStates(prev => {
                const next: Record<string, DatasetState> = {};
                update.datasets!.forEach(({ name, status }) => {
                  starts[name] = Date.now();
                  handles[name] = startInteraction(`hydrate.stream.${name}`);
                  recordReportingDatasetActivity({
                    key: name,
                    status: status === 'loading' ? 'loading' : 'idle',
                    updatedAt: starts[name],
                    source: 'reporting-stream',
                  });
                  const previous = prev[name];
                  next[name] = {
                    status: status as 'loading',
                    data: previous?.data ?? null,
                    cached: previous?.cached ?? false,
                    count: previous?.count ?? 0,
                    updatedAt: undefined,
                    elapsedMs: 0,
                  };
                });
                return next;
              });
            }
            break;

          case 'dataset-complete':
            if (update.dataset) {
              const started = starts[update.dataset!];
              if (started) {
                const elapsed = Date.now() - started;
                if (update.cached) {
                  cachedCount++;
                  cachedElapsed += elapsed;
                } else {
                  freshCount++;
                  freshElapsed += elapsed;
                }
              }
              const handle = handles[update.dataset!];
              if (handle) {
                handle.end({ cached: !!update.cached, count: update.count || 0 });
                delete handles[update.dataset!];
              }
              const elapsedMs = started ? Date.now() - started : 0;
              // Dataset ready - tracked via state
              recordReportingDatasetActivity({
                key: update.dataset,
                status: 'ready',
                count: update.count || 0,
                cached: update.cached || false,
                source: 'reporting-stream',
              });
              setDatasetStates(prev => {
                const next = {
                  ...prev,
                  [update.dataset!]: {
                    status: 'ready' as const,
                    data: update.data,
                    cached: update.cached || false,
                    count: update.count || 0,
                    updatedAt: Date.now(),
                    elapsedMs: started ? Date.now() - started : undefined,
                  },
                };
                if (effectiveClientCacheKey) streamingDatasetClientCache.set(effectiveClientCacheKey, next);
                return next;
              });
            }
            break;

          case 'dataset-error':
            if (update.dataset) {
              const started = starts[update.dataset!];
              const handle = handles[update.dataset!];
              if (handle) {
                handle.end({ error: true, message: update.error });
                delete handles[update.dataset!];
              }


              recordReportingDatasetActivity({
                key: update.dataset,
                status: 'error',
                count: 0,
                source: 'reporting-stream',
              });
              setDatasetStates(prev => {
                const next = {
                  ...prev,
                  [update.dataset!]: {
                    ...prev[update.dataset!],
                    status: 'error' as const,
                    error: update.error,
                    updatedAt: Date.now(),
                    elapsedMs: started ? Date.now() - started : undefined,
                  },
                };
                if (effectiveClientCacheKey) streamingDatasetClientCache.set(effectiveClientCacheKey, next);
                return next;
              });
            }
            break;

          case 'complete':
            setIsComplete(true);
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            // Clear timeout since we completed successfully
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }

            
            // Print one concise summary
            const totalElapsed = Date.now() - streamStart;
            const avgFresh = freshCount ? Math.round(freshElapsed / freshCount) : 0;
            const avgCached = cachedCount ? Math.round(cachedElapsed / cachedCount) : 0;
            const estSaved = freshCount 
              ? Math.max(0, (avgFresh * cachedCount) - cachedElapsed) 
              : 0;
            // eslint-disable-next-line no-console
            console.info(
              `✨ Reporting complete in ${Math.round(totalElapsed)}ms | ` +
              `📦 cached: ${cachedCount}${cachedCount ? ` (avg ${avgCached}ms)` : ''} | ` +
              `🔄 fresh: ${freshCount}${freshCount ? ` (avg ${avgFresh}ms)` : ''}` +
              (estSaved ? ` | ⚡ saved ~${Math.round(estSaved)}ms by caching` : '')
            );
            stop({ resetComplete: false }); // Close the connection but keep completion state until next start
            break;
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Streaming update parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      // eslint-disable-next-line no-console
      console.error('Reporting stream connection error:', error, 'state:', eventSource.readyState);
      setIsConnected(false);
      
      // Only close if connection is permanently failed (readyState 2) 
      // EventSource will auto-retry for temporary network issues (readyState 0)
      if (eventSource.readyState === EventSource.CLOSED) {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Mark remaining loading datasets as error to prevent infinite loading
        setDatasetStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(dataset => {
            if (next[dataset].status === 'loading') {
              next[dataset] = {
                ...next[dataset],
                status: 'error',
                error: 'Connection failed',
                updatedAt: Date.now(),
              };
            }
          });
          return next;
        });
        setIsComplete(true);
      }
    };
  }, [clientCacheKey, datasets, entraId, bypassCache, maxConcurrent, queryParams, reuseCachedSession]);

  // Auto-start if requested (do not depend on `start` to avoid effect restarts on re-render)
  useEffect(() => {
    if (!autoStart) return;
    start();
    const undoHmr = disposeOnHmr(() => {
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch { /* */ }
        eventSourceRef.current = null;
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    });
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      undoHmr();
      setIsConnected(false);
      setIsComplete(false);
    };
  }, [autoStart]);

  // Calculate progress
  const progress = {
    completed: Object.values(datasetStates).filter(state => 
      state.status === 'ready' || state.status === 'error'
    ).length,
    total: Object.keys(datasetStates).length,
    percentage: Object.keys(datasetStates).length > 0 
      ? (Object.values(datasetStates).filter(state => 
          state.status === 'ready' || state.status === 'error'
        ).length / Object.keys(datasetStates).length) * 100
      : 0,
  };

  return {
    datasets: datasetStates,
    isConnected,
    isComplete,
    start,
    stop,
    progress,
  };
}

export default useStreamingDatasets;