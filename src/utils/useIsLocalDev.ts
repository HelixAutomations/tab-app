/**
 * Utility for checking if we're in local development mode.
 * 
 * When "View as Production" is enabled in the user bubble,
 * this will return false even on localhost - allowing you to
 * preview how the app will look in production.
 * 
 * Usage:
 *   const isLocalDev = useIsLocalDev(featureToggles);
 *   // or for simple checks without feature toggles:
 *   const isLocalDev = checkIsLocalDev();
 */

/**
 * Check if we're actually running on localhost
 */
export const isActuallyLocalhost = (): boolean => {
  return typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
};

/**
 * Check if we should behave as local dev mode.
 * Returns false if "View as Production" is enabled, even on localhost.
 * 
 * @param featureToggles - The feature toggles record from context
 * @returns true if we should show dev-only features
 */
export const checkIsLocalDev = (featureToggles?: Record<string, boolean>): boolean => {
  const actuallyLocal = isActuallyLocalhost();
  
  // If we're not on localhost, never act as local dev
  if (!actuallyLocal) return false;
  
  // If "View as Production" is enabled, pretend we're not local
  if (featureToggles?.viewAsProd) return false;
  
  return true;
};

/**
 * Hook version for components that already have featureToggles in their props
 * This is just a convenience wrapper
 */
export const useIsLocalDev = (featureToggles?: Record<string, boolean>): boolean => {
  return checkIsLocalDev(featureToggles);
};

export default checkIsLocalDev;
