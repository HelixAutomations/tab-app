/**
 * Safe localStorage utilities with quota management
 */

export interface StorageQuotaInfo {
  used: number;
  total: number;
  available: number;
  percentUsed: number;
}

/**
 * Get localStorage usage information
 */
export const getStorageQuota = (): StorageQuotaInfo => {
  let used = 0;
  let total = 5 * 1024 * 1024; // Default 5MB assumption
  
  try {
    // Calculate used space
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length;
      }
    }
    
    // Try to estimate total space (this is approximate)
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      // This is async, but we'll return the default for now
      navigator.storage.estimate().then(estimate => {
        if (estimate.quota) {
          total = estimate.quota;
        }
      });
    }
  } catch (error) {
    console.warn('Could not calculate storage usage:', error);
  }
  
  return {
    used,
    total,
    available: total - used,
    percentUsed: (used / total) * 100
  };
};

/**
 * Clear old/large items from localStorage when quota is exceeded
 */
export const cleanupLocalStorage = (): void => {
  if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
    // eslint-disable-next-line no-console
    console.log('🧹 Starting localStorage cleanup...');
  }
  
  const itemsToCheck = [];
  
  // Collect all items with their sizes
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const value = localStorage[key];
      itemsToCheck.push({
        key,
        size: value.length,
        value
      });
    }
  }
  
  // Sort by size (largest first)
  itemsToCheck.sort((a, b) => b.size - a.size);
  
  if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
    // eslint-disable-next-line no-console
    console.log('📊 Current localStorage items:', itemsToCheck.map(item => ({
      key: item.key,
      sizeKB: Math.round(item.size / 1024)
    })));
  }
  
  // Remove largest items first, prioritizing cache data
  const keysToRemove = [];
  
  for (const item of itemsToCheck) {
    // Prioritize removing cache data and large items
    if (item.key.includes('cache') || 
        item.key.includes('Data') || 
        item.key.includes('prefetched') ||
        item.size > 100000) { // Items larger than ~100KB
      keysToRemove.push(item.key);
    }
  }
  
  // Remove items
  keysToRemove.forEach((key: string) => {
    try {
      localStorage.removeItem(key);
      if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
        // eslint-disable-next-line no-console
        console.log(`🗑️ Removed localStorage item: ${key}`);
      }
    } catch (error) {
      console.warn(`Failed to remove localStorage item ${key}:`, error);
    }
  });
  
  const quota = getStorageQuota();
  if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
    // eslint-disable-next-line no-console
    console.log(`✅ Cleanup complete. Storage usage: ${quota.percentUsed.toFixed(1)}%`);
  }
};

/**
 * Safely set item in localStorage with quota management
 */
export const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[Storage] localStorage quota exceeded, attempting cleanup');
      
      // Try cleanup and retry
      cleanupLocalStorage();
      
      try {
        localStorage.setItem(key, value);
        if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
          // eslint-disable-next-line no-console
          console.log(`✅ Successfully stored ${key} after cleanup`);
        }
        return true;
      } catch (retryError) {
        console.error(`[Storage] Failed to store ${key} even after cleanup:`, retryError);
        return false;
      }
    } else {
      console.error(`[Storage] Failed to store ${key}:`, error);
      return false;
    }
  }
};

/**
 * Safely get item from localStorage
 */
export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to get localStorage item ${key}:`, error);
    return null;
  }
};

/**
 * Safely remove item from localStorage
 */
export const safeRemoveItem = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove localStorage item ${key}:`, error);
    return false;
  }
};

/**
 * Check if localStorage has enough space for a value
 */
export const hasStorageSpace = (estimatedSize: number): boolean => {
  const quota = getStorageQuota();
  return quota.available > estimatedSize * 2; // 2x buffer
};

/**
 * Log current storage usage (for debugging)
 */
export const logStorageUsage = (): void => {
  if (process.env.REACT_APP_DEBUG_VERBOSE !== 'true') return;
  const quota = getStorageQuota();
  console.log('[Storage] localStorage Usage:', {
    usedMB: (quota.used / (1024 * 1024)).toFixed(2),
    totalMB: (quota.total / (1024 * 1024)).toFixed(2),
    percentUsed: quota.percentUsed.toFixed(1) + '%',
    availableMB: (quota.available / (1024 * 1024)).toFixed(2)
  });
};