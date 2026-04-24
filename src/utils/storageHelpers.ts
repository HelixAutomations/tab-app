/**
 * Storage helpers with quota management for Teams embedded environment
 * Teams has stricter localStorage limits than browsers
 */

const STORAGE_QUOTA_WARNING_THRESHOLD = 0.8; // Warn at 80% full
const MAX_CACHE_AGE_MS = 15 * 60 * 1000; // 15 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

/**
 * Check if localStorage is available and not throwing errors
 */
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get approximate localStorage usage (not exact, but good enough for warnings)
 */
export function getStorageUsage(): { used: number; available: number; percentUsed: number } {
  if (!isStorageAvailable()) {
    return { used: 0, available: 0, percentUsed: 0 };
  }

  try {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        used += key.length + (value?.length || 0);
      }
    }
    
    // Estimate: Teams typically allows 5-10MB, browsers allow 5-10MB
    // We'll assume 5MB (5 * 1024 * 1024 bytes) to be conservative
    const available = 5 * 1024 * 1024;
    const percentUsed = (used / available) * 100;
    
    return { used, available, percentUsed };
  } catch {
    return { used: 0, available: 0, percentUsed: 0 };
  }
}

/**
 * Clean up old cache entries if storage is getting full.
 *
 * Tiered eviction — the gentler passes only run when storage is mildly full;
 * aggressive passes kick in when we're near/over quota. This prevents the
 * "116% full, cleanup warning fires every reload, nothing actually freed"
 * loop where age-gated cleanup can't evict <15min old entries.
 */
export function cleanupOldCache(): void {
  if (!isStorageAvailable()) return;

  try {
    const { percentUsed } = getStorageUsage();
    if (percentUsed <= STORAGE_QUOTA_WARNING_THRESHOLD * 100) return;

    console.warn(`⚠️ Storage usage at ${percentUsed.toFixed(1)}% - cleaning up old cache`);

    const now = Date.now();

    // Collect every key + size once; we'll choose what to remove per tier.
    interface KeyMeta { key: string; size: number; timestamp?: number; isCache: boolean; }
    const entries: KeyMeta[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) || '';
      const size = key.length + value.length;
      let timestamp: number | undefined;
      const lower = key.toLowerCase();
      const isCache =
        key.includes('userData-') || key.includes('enquiries-') ||
        key.includes('matters-') || key.startsWith('normalizedMatters-') ||
        key.startsWith('vnetMatters-') || key === 'allMatters' ||
        key === 'teamData' || lower.startsWith('outstandingbalancesdata') ||
        lower.startsWith('futurebookingssnapshot') || lower.startsWith('ccldraftcache.') ||
        lower.startsWith('helix.demo.') || lower.startsWith('pitchbuilder.') ||
        lower.startsWith('reporting-') || lower.startsWith('home-');
      try {
        const parsed = JSON.parse(value) as { timestamp?: number };
        if (parsed && typeof parsed.timestamp === 'number') timestamp = parsed.timestamp;
      } catch { /* not a timestamped cache entry */ }
      entries.push({ key, size, timestamp, isCache });
    }

    const keysToRemove = new Set<string>();

    // Tier 1 — prefix-matched + age-gated (preserves fresh, intentional caches).
    for (const e of entries) {
      if (!e.isCache) continue;
      if (e.timestamp && now - e.timestamp > MAX_CACHE_AGE_MS) keysToRemove.add(e.key);
    }

    // Tier 2 (≥90%) — drop ALL prefix-matched cache entries regardless of age,
    // largest first. Fresh caches get rebuilt on next fetch; stale data in
    // storage is worse than a one-request penalty.
    if (percentUsed >= 90) {
      const cacheEntries = entries
        .filter((e) => e.isCache && !keysToRemove.has(e.key))
        .sort((a, b) => b.size - a.size);
      for (const e of cacheEntries) keysToRemove.add(e.key);
    }

    // Tier 3 (≥100%, quota breached) — drop ANY JSON-shaped timestamped entry,
    // largest first. Non-timestamped keys (user prefs, flags) are preserved.
    if (percentUsed >= 100) {
      const timestamped = entries
        .filter((e) => typeof e.timestamp === 'number' && !keysToRemove.has(e.key))
        .sort((a, b) => b.size - a.size);
      for (const e of timestamped) keysToRemove.add(e.key);
    }

    let freedBytes = 0;
    keysToRemove.forEach((key) => {
      const match = entries.find((e) => e.key === key);
      if (match) freedBytes += match.size;
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });

    if (keysToRemove.size > 0) {
      // One-line summary so ops can see eviction actually happened.
      /* eslint-disable no-console */
      console.info(`🧹 Evicted ${keysToRemove.size} cache entries (~${(freedBytes / 1024).toFixed(0)}KB freed)`);
      /* eslint-enable no-console */
    }
  } catch (error) {
    console.error('Error during cache cleanup:', error);
  }
}

/**
 * Safely get cached data with automatic cleanup
 */
export function getCachedData<T>(key: string): T | null {
  if (!isStorageAvailable()) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const { data, timestamp } = JSON.parse(raw) as CachedData<T>;
    
    // Check if cache is still valid
    if (Date.now() - timestamp < MAX_CACHE_AGE_MS) {
      return data;
    }
    
    // Remove expired entry
    localStorage.removeItem(key);
    return null;
  } catch {
    // If parsing fails, remove the corrupt entry
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore removal errors
    }
    return null;
  }
}

/**
 * Safely set cached data with quota management
 * Automatically skips caching for large datasets that would exceed quota
 */
export function setCachedData(key: string, data: unknown): boolean {
  if (!isStorageAvailable()) return false;

  try {
    const payload = JSON.stringify({ 
      data, 
      timestamp: Date.now() 
    } as CachedData<unknown>);
    
    // Check payload size before attempting to store
    // Skip caching if payload is > 1MB (too large for Teams localStorage)
    const payloadSize = payload.length * 2; // Approximate bytes (UTF-16)
    const maxPayloadSize = 1 * 1024 * 1024; // 1MB
    
    if (payloadSize > maxPayloadSize) {
      // Silently fallback to in-memory cache - no need to log
      return false;
    }
    
    // Clean up old cache before adding new data
    cleanupOldCache();
    
    localStorage.setItem(key, payload);
    return true;
  } catch (error) {
    // Likely quota exceeded
    // Cache failure is handled silently - retry with cleanup
    
    // Try emergency cleanup and retry ONCE
    try {
      cleanupOldCache();
      
      const payload = JSON.stringify({ 
        data, 
        timestamp: Date.now() 
      } as CachedData<unknown>);
      
      localStorage.setItem(key, payload);
      return true;
    } catch {
      // Storage quota exceeded - silently skip cache for this key
      return false;
    }
  }
}

/**
 * Clear all app cache entries
 */
export function clearAllCache(): void {
  if (!isStorageAvailable()) return;

  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Remove app-specific cache keys
      if (key.includes('userData-') || key.includes('enquiries-') || 
          key.includes('matters-') || key.startsWith('normalizedMatters-') ||
          key.startsWith('vnetMatters-') || key === 'allMatters' ||
          key === 'teamData') {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    });
    
    // Cache cleared silently
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}
