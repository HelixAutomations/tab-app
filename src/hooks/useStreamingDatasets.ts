import { useCallback, useEffect, useRef, useState } from 'react';

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
  start: (override?: { datasets?: string[]; bypassCache?: boolean }) => void;
  stop: () => void;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export function useStreamingDatasets(options: UseStreamingDatasetsOptions = {}): UseStreamingDatasetsResult {
  const {
    datasets = ['userData', 'teamData', 'enquiries', 'allMatters', 'wip', 'recoveredFees', 'poidData', 'wipClioCurrentWeek'],
    entraId,
    bypassCache = false,
    autoStart = false,
    maxConcurrent = 3, // Process up to 3 datasets in parallel for optimal performance
  } = options;

  const [datasetStates, setDatasetStates] = useState<Record<string, DatasetState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsConnected(false);
    setIsComplete(false);
  }, []);

  const start = useCallback((override?: { datasets?: string[]; bypassCache?: boolean }) => {
    // Close existing connection first
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsComplete(false);

    // Build URL with query parameters
    const effectiveDatasets = override?.datasets && override.datasets.length > 0 ? override.datasets : datasets;
    const effectiveBypass = override?.bypassCache ?? bypassCache;

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

    // Create EventSource connection
    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    // Track timings for a concise summary at the end
    const streamStart = Date.now();
    const starts: Record<string, number> = {};
    let cachedCount = 0;
    let cachedElapsed = 0;
    let freshCount = 0;
    let freshElapsed = 0;

    eventSource.onopen = () => {
      setIsConnected(true);
      setIsComplete(false);
      
      // Set a timeout to mark stuck datasets as error after 5 minutes
      timeoutRef.current = setTimeout(() => {
        console.warn('Streaming timeout reached - marking incomplete datasets as error');
        setDatasetStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(dataset => {
            if (next[dataset].status === 'loading') {
              next[dataset] = {
                ...next[dataset],
                status: 'error',
                error: 'Timeout: Dataset took too long to load (>5min)',
                updatedAt: Date.now(),
                elapsedMs: starts[dataset] ? Date.now() - starts[dataset] : undefined,
              };

            }
          });
          return next;
        });
        setIsComplete(true);
        stop();
      }, 300000); // 5 minutes timeout (300 seconds)
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
                  next[name] = {
                    status: status as 'loading',
                    data: null,
                    cached: false,
                    count: 0,
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
              setDatasetStates(prev => ({
                ...prev,
                [update.dataset!]: {
                  status: 'ready',
                  data: update.data,
                  cached: update.cached || false,
                  count: update.count || 0,
                  updatedAt: Date.now(),
                  elapsedMs: started ? Date.now() - started : undefined,
                },
              }));
            }
            break;

          case 'dataset-error':
            if (update.dataset) {
              const started = starts[update.dataset!];

              
              setDatasetStates(prev => ({
                ...prev,
                [update.dataset!]: {
                  ...prev[update.dataset!],
                  status: 'error',
                  error: update.error,
                  updatedAt: Date.now(),
                  elapsedMs: started ? Date.now() - started : undefined,
                },
              }));
            }
            break;

          case 'complete':
            setIsComplete(true);
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
              `Reporting stream: ${cachedCount + freshCount} datasets in ${Math.round(totalElapsed)}ms | cached: ${cachedCount}` +
              (cachedCount ? ` (avg ${avgCached}ms)` : '') +
              ` | fresh: ${freshCount}` + (freshCount ? ` (avg ${avgFresh}ms)` : '') +
              (estSaved ? ` | est. saved ~${Math.round(estSaved)}ms` : '')
            );
            stop(); // Close the connection
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
      // Don't call stop() here to avoid circular dependency, just close directly
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [datasets, entraId, bypassCache]);

  // Auto-start if requested (do not depend on `start` to avoid effect restarts on re-render)
  useEffect(() => {
    if (!autoStart) return;
    start();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
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