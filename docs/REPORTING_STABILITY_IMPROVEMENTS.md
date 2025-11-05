# Reporting Stability Improvements

## Issues Identified

### 1. **Backend Query Stability**
- Heavy queries (WIP, recoveredFees, POID) can timeout or fail
- SQL connection pool exhaustion under load
- No query cancellation mechanism
- Redis connection failures cascade to total failures

### 2. **Frontend Request Handling**
- No timeout on fetch requests (fixed for annual leave, needs global solution)
- Single failure can block entire UI
- No retry mechanism for transient failures
- Error states don't clear properly

### 3. **Cache Instability**
- Cache failures cause full re-fetch (no graceful degradation)
- No stale-while-revalidate pattern
- Cache invalidation too aggressive
- No cache warming strategy

## Proposed Solutions

### Backend Improvements

#### 1. Query Timeout Protection
```javascript
// Add to all SQL queries
const QUERY_TIMEOUTS = {
  light: 30000,   // 30s for simple queries
  medium: 60000,  // 1min for moderate queries
  heavy: 120000   // 2min for complex aggregations
};

// Implement query cancellation
async function executeWithTimeout(query, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await query(controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Query timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}
```

#### 2. Graceful Cache Degradation
```javascript
// Return stale data if fresh fetch fails
async function fetchWithFallback(key, fetcher, ttl) {
  try {
    const fresh = await fetcher();
    await cache.set(key, fresh, ttl);
    return { data: fresh, stale: false };
  } catch (error) {
    const stale = await cache.get(key);
    if (stale) {
      console.warn('Returning stale data after fetch failure');
      return { data: stale, stale: true };
    }
    throw error;
  }
}
```

#### 3. Connection Pool Management
```javascript
// Add to db.js
const pool = new sql.ConnectionPool({
  // ... existing config
  max: 20,           // Max connections
  min: 2,            // Min connections
  idleTimeoutMillis: 30000,
  connectionTimeout: 15000,
  requestTimeout: 45000, // Default request timeout
  retryTimes: 3      // Retry failed connections
});
```

#### 4. Circuit Breaker Pattern
```javascript
// Prevent cascade failures
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

### Frontend Improvements

#### 1. Global Fetch Timeout Wrapper
```typescript
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
```

#### 2. Retry Logic with Exponential Backoff
```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error) {
      if (i === maxRetries) throw error;
      
      const isRetryable = 
        error instanceof TypeError || // Network error
        (error instanceof Error && error.message.includes('timeout'));
      
      if (!isRetryable) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

#### 3. Progressive Enhancement
```typescript
// Load critical data first, optional data later
const refreshPriority = {
  critical: ['userData', 'teamData', 'enquiries'],
  important: ['allMatters', 'wip'],
  optional: ['recoveredFees', 'poidData', 'metaMetrics']
};

async function refreshWithPriority() {
  setIsFetching(true);
  
  try {
    // Load critical data first
    await loadDatasets(refreshPriority.critical);
    setMinimumViable(true); // UI can render now
    
    // Load important data
    await loadDatasets(refreshPriority.important);
    
    // Load optional data (failures are non-blocking)
    await loadDatasetsOptional(refreshPriority.optional);
  } finally {
    setIsFetching(false);
  }
}
```

#### 4. Partial Failure Recovery
```typescript
// Don't block entire refresh if one dataset fails
async function performStreamingRefresh(forceRefresh: boolean) {
  setIsFetching(true);
  const errors: Record<string, string> = {};
  
  try {
    for (const dataset of datasetsToRefresh) {
      try {
        await refreshDataset(dataset, forceRefresh);
      } catch (error) {
        errors[dataset] = error.message;
        console.error(`Dataset ${dataset} failed, continuing...`, error);
        setDatasetStatus(prev => ({
          ...prev,
          [dataset]: { status: 'error', updatedAt: Date.now() }
        }));
      }
    }
    
    if (Object.keys(errors).length > 0) {
      setPartialError(`Some datasets failed: ${Object.keys(errors).join(', ')}`);
    }
  } finally {
    setIsFetching(false);
  }
}
```

### Testing Strategy

1. **Load Testing**
   - Simulate 20 concurrent users refreshing reports
   - Test behavior under SQL server load
   - Verify cache hit rates under load

2. **Failure Testing**
   - Disconnect Redis and verify graceful degradation
   - Kill SQL connections mid-query
   - Test network timeouts

3. **Recovery Testing**
   - Verify retry mechanisms work
   - Test circuit breaker recovery
   - Confirm stale data fallback

## Implementation Priority

1. ✅ **DONE**: Add timeouts to annual leave fetch
2. **HIGH**: Add global fetch timeout wrapper to all frontend requests
3. **HIGH**: Implement graceful cache degradation (return stale on failure)
4. **HIGH**: Add retry logic to critical endpoints
5. **MEDIUM**: Implement circuit breaker for SQL queries
6. **MEDIUM**: Add partial failure recovery to refresh flows
7. **LOW**: Add connection pool monitoring
8. **LOW**: Implement progressive data loading

## Success Metrics

- Zero "stuck" UI states (current: frequent)
- <5% request timeout rate (current: ~10%)
- <1s average response time for cached data (current: ~500ms)
- 95% cache hit rate (current: ~70%)
- Recovery time <30s after transient failure (current: requires page reload)
