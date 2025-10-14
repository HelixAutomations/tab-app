/**
 * Performance utilities for UI responsiveness optimization
 * Addresses button click delays and navigation lag issues
 */

import { useCallback, useState, useRef } from 'react';

/**
 * Hook for optimistic button interactions with immediate feedback
 */
export const useOptimisticAction = () => {
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const executeAction = useCallback(async <T>(
    action: () => Promise<T>,
    options?: {
      optimisticUpdate?: () => void;
      onError?: (error: Error) => void;
      onSuccess?: (result: T) => void;
    }
  ): Promise<T | null> => {
    // Prevent duplicate clicks
    if (loadingRef.current) return null;
    
    try {
      // Immediate UI feedback
      setIsLoading(true);
      loadingRef.current = true;
      
      // Apply optimistic update immediately
      if (options?.optimisticUpdate) {
        options.optimisticUpdate();
      }
      
      // Execute actual action
      const result = await action();
      
      if (options?.onSuccess) {
        options.onSuccess(result);
      }
      
      return result;
    } catch (error) {
      console.error('Action failed:', error);
      
      if (options?.onError) {
        options.onError(error as Error);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  return { executeAction, isLoading };
};

/**
 * Debounce utility with immediate UI feedback
 */
export class UIPerformanceOptimizer {
  private static debounceTimers = new Map<string, NodeJS.Timeout>();
  private static throttleLastCalls = new Map<string, number>();

  /**
   * Debounce with immediate UI feedback
   */
  static debounceWithFeedback<T extends (...args: any[]) => Promise<any>>(
    action: T,
    delay: number,
    key: string,
    feedbackFn?: () => void
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      // Immediate UI feedback
      if (feedbackFn) {
        feedbackFn();
      }
      
      // Clear existing timer
      const existingTimer = this.debounceTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        try {
          await action(...args);
        } catch (error) {
          console.error(`Debounced action "${key}" failed:`, error);
        } finally {
          this.debounceTimers.delete(key);
        }
      }, delay);

      this.debounceTimers.set(key, timer);
    };
  }

  /**
   * Throttle for rapid user interactions
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number,
    key: string
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      const now = Date.now();
      const lastCall = this.throttleLastCalls.get(key) || 0;
      
      if (now - lastCall >= delay) {
        this.throttleLastCalls.set(key, now);
        func(...args);
      }
    };
  }

  /**
   * Batch React state updates to prevent multiple re-renders
   */
  static batchStateUpdates(updates: (() => void)[]): void {
    // Use React 18's automatic batching or manual batching for older versions
    if (typeof window !== 'undefined' && 'ReactDOM' in window) {
      const ReactDOM = (window as any).ReactDOM;
      if (ReactDOM.unstable_batchedUpdates) {
        ReactDOM.unstable_batchedUpdates(() => {
          updates.forEach(update => update());
        });
        return;
      }
    }
    
    // Fallback: execute all updates in next tick
    Promise.resolve().then(() => {
      updates.forEach(update => update());
    });
  }

  /**
   * Request deduplication to prevent duplicate API calls
   */
  private static pendingRequests = new Map<string, Promise<any>>();

  static async deduplicateRequest<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Return existing request if in progress
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }

    // Create new request
    const promise = requestFn();
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Progressive loading helper
   */
  static async loadProgressive<T>(config: {
    critical: Array<{ key: string; loader: () => Promise<T> }>;
    secondary: Array<{ key: string; loader: () => Promise<T> }>;
    onCriticalLoaded: (results: Map<string, T>) => void;
    onSecondaryLoaded: (results: Map<string, T>) => void;
  }): Promise<void> {
    // Load critical data first
    const criticalResults = new Map<string, T>();
    
    await Promise.allSettled(
      config.critical.map(async ({ key, loader }) => {
        try {
          const result = await loader();
          criticalResults.set(key, result);
        } catch (error) {
          console.warn(`Critical load failed for ${key}:`, error);
        }
      })
    );

    // Notify critical data ready (UI can render)
    config.onCriticalLoaded(criticalResults);

    // Load secondary data
    const secondaryResults = new Map<string, T>();
    
    await Promise.allSettled(
      config.secondary.map(async ({ key, loader }) => {
        try {
          const result = await loader();
          secondaryResults.set(key, result);
        } catch (error) {
          console.warn(`Secondary load failed for ${key}:`, error);
        }
      })
    );

    // Notify secondary data ready
    config.onSecondaryLoaded(secondaryResults);
  }
}

/**
 * Hook for handling loading states with automatic timeout
 */
export const useLoadingState = (timeoutMs: number = 30000) => {
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    
    // Auto-stop loading after timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      console.warn('Loading state timed out');
    }, timeoutMs);
  }, [timeoutMs]);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { isLoading, startLoading, stopLoading };
};

/**
 * Environment detection for performance tuning
 */
export const getEnvironmentConfig = () => {
  const isTeamsEmbed = typeof window !== 'undefined' && window !== window.top;
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return {
    isTeamsEmbed,
    isProduction,
    isLocalhost,
    // Adjust timeouts based on environment
    requestTimeout: isTeamsEmbed ? 5000 : isProduction ? 8000 : 10000,
    debounceDelay: isTeamsEmbed ? 500 : 300,
    throttleDelay: isTeamsEmbed ? 1000 : 500,
    pollInterval: isTeamsEmbed ? 30000 : 15000,
  };
};

/**
 * Performance monitoring utilities
 */
export const performanceMonitor = {
  /**
   * Measure component render time
   */
  measureRender: (componentName: string, renderFn: () => void) => {
    const startTime = performance.now();
    renderFn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (duration > 16) { // Warn if slower than 60fps
      console.warn(`Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
    }
  },

  /**
   * Mark performance milestones
   */
  mark: (name: string) => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  },

  /**
   * Measure time between marks
   */
  measure: (name: string, startMark: string, endMark?: string) => {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const entries = performance.getEntriesByName(name);
        const latest = entries[entries.length - 1];
        if (latest && latest.duration > 100) { // Warn if over 100ms
          console.warn(`Performance: ${name} took ${latest.duration.toFixed(2)}ms`);
        }
      } catch (error) {
        console.warn('Performance measurement failed:', error);
      }
    }
  }
};