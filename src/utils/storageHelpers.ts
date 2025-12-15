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
 * Clean up old cache entries if storage is getting full
 */
export function cleanupOldCache(): void {
  if (!isStorageAvailable()) return;

  try {
    const { percentUsed } = getStorageUsage();
    
    // If we're above warning threshold, clean up old entries
    if (percentUsed > STORAGE_QUOTA_WARNING_THRESHOLD * 100) {
      console.warn(`⚠️ Storage usage at ${percentUsed.toFixed(1)}% - cleaning up old cache`);
      
      const now = Date.now();
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Check if this is a cached data entry
        if (key.includes('userData-') || key.includes('enquiries-') || 
            key.includes('matters-') || key.startsWith('normalizedMatters-') ||
            key.startsWith('vnetMatters-') || key === 'allMatters') {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              const parsed = JSON.parse(value) as CachedData<unknown>;
              // Remove if older than cache age
              if (now - parsed.timestamp > MAX_CACHE_AGE_MS) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // If we can't parse it, it's probably corrupt - remove it
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore removal errors
        }
      });
      
      // Cleanup is silent - no need to log routine cache management
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
