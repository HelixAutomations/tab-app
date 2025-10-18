/**
 * Robust fetch utilities with timeout, retry, and error handling
 */

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Fetch with automatic timeout protection
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
): Promise<Response> {
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

/**
 * Fetch with automatic retry on transient failures
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, fetchOptions, timeout);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === retries) break;

      // Check if error is retryable
      const isRetryable =
        error instanceof TypeError || // Network error
        (error instanceof Error && 
         (error.message.includes('timeout') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT')));

      if (!isRetryable) {
        throw error;
      }

      // Exponential backoff
      const delay = retryDelay * Math.pow(2, attempt);
      console.log(
        `🔄 Retry ${attempt + 1}/${retries} for ${url} after ${delay}ms (${lastError.message})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries} retries`);
}

/**
 * Fetch JSON with automatic error handling
 */
export async function fetchJSON<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`
    );
  }

  try {
    return await response.json();
  } catch (parseError) {
    throw new Error(`Failed to parse JSON response from ${url}`);
  }
}

/**
 * Safe fetch that returns error state instead of throwing
 */
export async function safeFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await fetchJSON<T>(url, options);
    return { ok: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Safe fetch failed for ${url}:`, errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/**
 * Check if an error is a transient network error (should be retried)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const transientPatterns = [
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'network',
    'fetch failed',
    'AbortError'
  ];

  return transientPatterns.some((pattern) =>
    error.message.toLowerCase().includes(pattern.toLowerCase())
  );
}
