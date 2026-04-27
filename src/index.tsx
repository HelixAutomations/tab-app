import React, { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./app/styles/index.css";
import App from "./app/App";
import { createTheme, ThemeProvider } from '@fluentui/react/lib/Theme';
import { colours } from "./app/styles/colours";
import { app } from "@microsoft/teams-js";
import { isInTeams } from "./app/functionality/isInTeams";
import { Matter, UserData, Enquiry, TeamData, NormalizedMatter } from "./app/functionality/types";
import { normalizeMatterData } from "./utils/matterNormalization";
import { getCachedData, setCachedData, cleanupOldCache } from "./utils/storageHelpers";
import { debugLog } from "./utils/debug";
import { isDevOwner } from "./app/admin";
import { appendDefaultEnquiryProcessingParams, enquiryReferencesId } from "./app/functionality/enquiryProcessingModel";
import { trackBootStage, trackBootSummary, trackClientError, trackClientEvent } from "./utils/telemetry";
import actionLog from "./utils/actionLog";
import { clearRequestAuthContext, writeRequestAuthContext } from "./utils/requestAuthContext";
import { disposeOnHmr, onServerBounced } from "./utils/devHmr";
import { stampBuildAttribute, registerWayfindingDebugApi } from "./utils/devWayfinding";
import { useDevServerBoot } from "./hooks/useDevServerBoot";
import { useRealtimeChannel } from "./hooks/useRealtimeChannel";
import "./utils/callLogger";
import { initializeIcons } from '@fluentui/react/lib/Icons';
import Loading from "./app/styles/Loading";
import ErrorBoundary from "./components/ErrorBoundary";
import EntryGate from "./components/EntryGate";
const WayfindingOverlay = process.env.NODE_ENV !== 'production'
  ? lazy(() => import('./components/dev/WayfindingOverlay'))
  : null;
const Data = lazy(() => import("./tabs/Data"));

// Initialize icons once.
// This must happen before first render, otherwise Fluent UI will warn that icons
// (e.g. "cancel", "lock", "briefcase") were used before registration.
if (typeof window !== 'undefined' && !(window as any).__iconsInitialized) {
  initializeIcons();
  (window as any).__iconsInitialized = true;
}

// Wayfinding: stamp build id on <html> and register the dev debug API.
// Both are safe in production; the debug API self-gates to dev.
stampBuildAttribute();
registerWayfindingDebugApi();

// Define the custom Fluent UI theme
// invisible change 2
const customTheme = createTheme({
  palette: {
    themePrimary: colours.blue,
    themeDark: colours.darkBlue,
    themeLighter: colours.highlight,
    accent: colours.accent,
    neutralLight: colours.grey,
    redDark: colours.cta,
    neutralPrimary: colours.websiteBlue,
  },
  semanticColors: {
    // Prevent Fluent's .body-XXX wrapper from imposing a static white
    // background — let App.tsx control the page bg via isDarkMode.
    bodyBackground: 'transparent',
  },
  fonts: {
    small: { fontFamily: "Raleway, sans-serif" },
    medium: { fontFamily: "Raleway, sans-serif" },
    large: { fontFamily: "Raleway, sans-serif" },
    xLarge: { fontFamily: "Raleway, sans-serif" },
  },
});

// Detect local development by hostname
const isLocalDevEnv = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const resolveSystemDarkMode = () => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const dismissStaticLoader = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const loader = document.getElementById('loading-screen');
  if (!loader) {
    return;
  }
  loader.classList.add('fade-out');
  window.setTimeout(() => loader.remove(), 360);
};

// Flag to decide whether to use local sample data instead of remote API
const inTeams = isInTeams();
const useLocalData =
  process.env.REACT_APP_USE_LOCAL_DATA === "true" || !inTeams;

actionLog('App boot', inTeams ? 'Teams' : 'local dev');

// Surface any unhandled promise rejections so they don't fail silently
if (typeof window !== "undefined") {
  if (!(window as any).__unhandledRejectionHandlerAdded) {
    (window as any).__unhandledRejectionHandlerAdded = true;

    const hasChunkReloadedKey = '__helix_chunk_reload_once__';
    // 2026-04-21: previously a single sessionStorage flag blocked all future
    // reloads after the first chunk-load failure. In dev that meant any
    // webpack rebuild + page refresh would trap the tab in the error
    // boundary forever (sessionStorage survives reloads). Two changes:
    //   1. Tag the guard with a timestamp and only suppress reloads within a
    //      30s window — long enough to prevent a true reload loop, short
    //      enough that a *new* stale-chunk error gets a fresh attempt.
    //   2. Tag the guard with the current build id (data-helix-build set by
    //      stampBuildAttribute()). When the build changes, the guard is
    //      automatically stale and a reload is allowed.
    const RELOAD_GUARD_WINDOW_MS = 30_000;
    const getCurrentBuildId = (): string => {
      try {
        return document.documentElement.dataset.helixBuild || 'unknown';
      } catch {
        return 'unknown';
      }
    };
    const isChunkLoadError = (reason: unknown) => {
      const anyReason = reason as any;
      const name = typeof anyReason?.name === 'string' ? anyReason.name : '';
      const message = typeof anyReason?.message === 'string' ? anyReason.message : '';
      const text = `${name} ${message}`.toLowerCase();
      return (
        text.includes('chunkloaderror') ||
        (text.includes('loading chunk') && text.includes('failed')) ||
        text.includes('css chunk load failed')
      );
    };

    const reloadOnceForChunkError = (source: 'unhandledrejection' | 'error', reason: unknown) => {
      trackClientEvent('Browser', 'chunk-reload', { source }, {
        error: reason instanceof Error ? reason.message : String(reason || 'Chunk load error'),
        throttleKey: `chunk-reload:${source}`,
        cooldownMs: 60000,
      });

      const currentBuild = getCurrentBuildId();
      try {
        const raw = sessionStorage.getItem(hasChunkReloadedKey);
        if (raw) {
          // Backwards compatible with old 'true' value: treat as fresh guard.
          let parsed: { ts?: number; build?: string } = {};
          try { parsed = JSON.parse(raw); } catch { parsed = { ts: Date.now() - 1000 }; }
          const withinWindow = typeof parsed.ts === 'number' && (Date.now() - parsed.ts) < RELOAD_GUARD_WINDOW_MS;
          const sameBuild = parsed.build === currentBuild;
          if (withinWindow && sameBuild) {
            console.error('[ChunkLoadError] reload already attempted in this build; staying put', { source, build: currentBuild });
            return;
          }
        }
        sessionStorage.setItem(hasChunkReloadedKey, JSON.stringify({ ts: Date.now(), build: currentBuild }));
      } catch {
        // If sessionStorage is unavailable, still attempt a reload once.
      }

      console.warn('[ChunkLoadError] forcing reload to recover', { source, build: currentBuild });
      // Hard reload is the most reliable way to pick up new chunk filenames.
      window.location.reload();
    };

    window.addEventListener("unhandledrejection", (event) => {
      if (isChunkLoadError(event.reason)) {
        reloadOnceForChunkError('unhandledrejection', event.reason);
        event.preventDefault();
        return;
      }

      trackClientError('Browser', 'unhandled-rejection', event.reason, {}, {
        throttleKey: `browser:unhandled-rejection:${String((event.reason as any)?.message || event.reason || 'unknown')}`,
        cooldownMs: 15000,
      });

      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault();
      // Don't use alert() in Teams - it can crash the embedded app
      // Just log and continue - user will see error in console if needed
    });

    // Some chunk load failures surface as window 'error' events rather than promise rejections.
    window.addEventListener('error', (event) => {
      const anyEvent = event as any;
      const reason = anyEvent?.error ?? anyEvent?.message;
      if (isChunkLoadError(reason)) {
        reloadOnceForChunkError('error', reason);
        return;
      }

      trackClientError('Browser', 'window-error', reason, {
        filename: typeof event.filename === 'string' ? event.filename.split('/').slice(-1)[0] : undefined,
        line: typeof event.lineno === 'number' ? event.lineno : undefined,
        column: typeof event.colno === 'number' ? event.colno : undefined,
      }, {
        throttleKey: `browser:window-error:${String((anyEvent?.message || '')).slice(0, 80)}`,
        cooldownMs: 15000,
      });
    });
  }
}

// Run cleanup on app start to prevent storage quota issues in Teams
if (typeof window !== 'undefined') {
  try {
    cleanupOldCache();
  } catch (error) {
    console.warn('Storage cleanup failed:', error);
  }
}

// ── Shell boot snapshot (sessionStorage) ──────────────────────────────────
// Stores core boot data so the next load can paint instantly with stale data
// while live fetches run in the background (snapshot-first paint).
const SHELL_SNAPSHOT_KEY = 'shell-boot-snapshot-v1';
const SHELL_SNAPSHOT_TTL = 8 * 60 * 1000; // 8 minutes — fast warm boots without stretching queue staleness too far

interface ShellBootSnapshot {
  objectId: string;
  userData: UserData[];
  enquiries: Enquiry[];
  teamData: TeamData[] | null;
  savedAt: number;
}

function readShellBootSnapshot(objectId: string): ShellBootSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SHELL_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot: ShellBootSnapshot = JSON.parse(raw);
    if (
      !snapshot.savedAt ||
      Date.now() - snapshot.savedAt > SHELL_SNAPSHOT_TTL ||
      snapshot.objectId !== objectId
    ) {
      sessionStorage.removeItem(SHELL_SNAPSHOT_KEY);
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function writeShellBootSnapshot(snapshot: ShellBootSnapshot): void {
  try {
    sessionStorage.setItem(SHELL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage quota exceeded — silent
  }
}

// In-memory cache for large datasets that exceed localStorage quota
// This persists for the session but doesn't use localStorage
const inMemoryCache = new Map<string, { data: any; timestamp: number }>();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — session-level caching

function getMemoryCachedData<T>(key: string): T | null {
  const cached = inMemoryCache.get(key);
  if (!cached) return null;
  
  // Check if still valid
  if (Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
    return cached.data as T;
  }
  
  // Expired - remove it
  inMemoryCache.delete(key);
  return null;
}

function setMemoryCachedData(key: string, data: any): void {
  inMemoryCache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  // Prevent memory leaks - limit to 10 entries
  if (inMemoryCache.size > 10) {
    const firstKey = inMemoryCache.keys().next().value;
    if (firstKey) {
      inMemoryCache.delete(firstKey);
    }
  }
}

function scheduleDeferredBootTask(task: () => void, delayMs = 900, idleTimeoutMs = 2500): void {
  const runTask = () => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as typeof window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => task(), { timeout: idleTimeoutMs });
      return;
    }
    globalThis.setTimeout(task, 0);
  };

  globalThis.setTimeout(runTask, delayMs);
}

/**
 * Purge all client-side enquiries caches (in-memory + localStorage + sessionStorage snapshot).
 * Called on SSE delete to prevent stale records from resurfacing.
 */
function clearClientEnquiriesCaches(): void {
  // 1. Clear in-memory cache entries for enquiries
  for (const key of Array.from(inMemoryCache.keys())) {
    if (key.startsWith('enquiries-v3-')) {
      inMemoryCache.delete(key);
    }
  }
  // 2. Clear localStorage entries for enquiries
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('enquiries-v3-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* localStorage unavailable */ }
  // 3. Clear Home metrics snapshot in sessionStorage (recent enquiry records)
  try { sessionStorage.removeItem('HomeMetricsSnapshot'); } catch { /* ignore */ }
}

// Helper function to calculate the date range (6 months)
const getDateRange = () => {
  // 4. Clear shell boot snapshot so stale enquiry state cannot survive a refresh
  try { sessionStorage.removeItem(SHELL_SNAPSHOT_KEY); } catch { /* ignore */ }
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1); // Increase range
  const startDate = new Date(
    twelveMonthsAgo.getFullYear(),
    twelveMonthsAgo.getMonth(),
    1,
  );
  const endDate = now;
  const formattedStartDate = startDate.toISOString().split("T")[0];
  const formattedEndDate = endDate.toISOString().split("T")[0];
  return {
    dateFrom: formattedStartDate,
    dateTo: formattedEndDate,
  };
};

// Fetch functions
type UserDataLookup = {
  objectId?: string;
  email?: string;
  initials?: string;
};

async function fetchUserData(identity: string | UserDataLookup): Promise<UserData[]> {
  const lookup = typeof identity === 'string'
    ? { objectId: identity }
    : (identity || {});
  const objectId = String(lookup.objectId || '').trim();
  const email = String(lookup.email || '').trim().toLowerCase();
  const initials = String(lookup.initials || '').trim().toUpperCase();

  if (!objectId && !email && !initials) {
    return [];
  }

  const cacheKey = `userData-${objectId || 'none'}-${email || 'none'}-${initials || 'none'}`;
  const cached = getCachedData<UserData[]>(cacheKey);
  if (cached) return cached;

  // Add timeout for Teams reliability (10 seconds for critical user data)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    // Use Express route instead of direct Azure Function call
    // This provides better error handling, logging, and CORS support
    const response = await fetch('/api/user-data', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(objectId ? { userObjectId: objectId } : {}),
        ...(email ? { email } : {}),
        ...(initials ? { initials } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok)
      throw new Error(`Failed to fetch user data: ${response.status}`);
    const raw = await response.json();
    // Normalize legacy spaced keys to camel/sans-space aliases used in the app
    const data: UserData[] = Array.isArray(raw)
      ? raw.map((u: any) => ({
          ...u,
          // Provide EntraID alias for "Entra ID"
          EntraID: u?.EntraID ?? u?.['Entra ID'],
          // Provide FullName alias for "Full Name"
          FullName: u?.FullName ?? u?.['Full Name'],
        }))
      : [];
    setCachedData(cacheKey, data);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('User data fetch timed out');
    }
    throw error;
  }
}

function normalizeUserRecord(user?: UserData | null): UserData | null {
  if (!user) {
    return null;
  }

  return {
    ...user,
    EntraID: user.EntraID || (user as any)["Entra ID"],
    ClioID: user.ClioID || (user as any)["Clio ID"],
    FullName: user.FullName || (user as any)["Full Name"],
  };
}

function mergeUserRecords(base?: UserData | null, hydrated?: UserData | null): UserData | null {
  const normalizedBase = normalizeUserRecord(base);
  const normalizedHydrated = normalizeUserRecord(hydrated);

  if (!normalizedBase && !normalizedHydrated) {
    return null;
  }

  return {
    ...(normalizedBase || {}),
    ...(normalizedHydrated || {}),
    EntraID: normalizedHydrated?.EntraID || normalizedBase?.EntraID,
    ClioID: normalizedHydrated?.ClioID || normalizedBase?.ClioID,
    FullName: normalizedHydrated?.FullName || normalizedBase?.FullName,
  } as UserData;
}

async function hydrateUserProfile(user?: UserData | null): Promise<UserData | null> {
  const normalizedUser = normalizeUserRecord(user);
  if (!normalizedUser) {
    return null;
  }

  const hasEntraId = String(normalizedUser.EntraID || '').trim().length > 0;
  const hasClioId = String(normalizedUser.ClioID || '').trim().length > 0;
  if (hasEntraId && hasClioId) {
    return normalizedUser;
  }

  const hydratedRows = await fetchUserData({
    objectId: normalizedUser.EntraID,
    email: normalizedUser.Email,
    initials: normalizedUser.Initials,
  });

  return mergeUserRecords(normalizedUser, (hydratedRows[0] as UserData | undefined) || null) || normalizedUser;
}

// ── In-flight request dedup (prevents Strict Mode / rapid re-render duplicates) ──
const inflightRequests = new Map<string, Promise<any>>();
function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const p = factory().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, p);
  return p;
}

// Dedup at the parsed-JSON level so two callers sharing the same promise
// don't race on Response.body consumption (body can only be read once).
const inflightJsonRequests = new Map<string, Promise<{ ok: boolean; status: number; data?: any }>>();
function dedupFetchJson(
  key: string,
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: any; networkError?: boolean }> {
  const existing = inflightJsonRequests.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const resp = await fetch(url, init);
      if (!resp.ok) return { ok: false, status: resp.status };
      const data = await resp.json();
      return { ok: true, status: resp.status, data };
    } catch {
      return { ok: false, status: 0, networkError: true };
    }
  })().finally(() => inflightJsonRequests.delete(key));
  inflightJsonRequests.set(key, p);
  return p;
}

const LOCAL_API_READY_MAX_WAIT_MS = 30000;
const LOCAL_API_READY_INITIAL_DELAY_MS = 150;

async function waitForLocalApiReady(): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  const hostname = window.location.hostname;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalHost) {
    return true;
  }

  return dedup('local-api-ready', async () => {
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt < LOCAL_API_READY_MAX_WAIT_MS) {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store',
          },
        });

        if (response.ok) {
          return true;
        }
      } catch {
        // Local API is still starting; keep polling quietly.
      }

      attempt += 1;
      const delayMs = Math.min(1500, LOCAL_API_READY_INITIAL_DELAY_MS * (2 ** Math.min(attempt, 4)));
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    return false;
  });
}

async function fetchEnquiries(
  email: string,
  dateFrom: string,
  dateTo: string,
  userAow: string = '',
  userInitials: string = '',
  fetchAll: boolean = false, // New parameter to fetch all enquiries without filtering
  bypassCache: boolean = false // When true, ignore client caches (used on refresh)
): Promise<Enquiry[]> {
  // Re-enable caching for production performance
  const forceNoCaching = false; // was: process.env.NODE_ENV === 'development'
  const cacheScope = fetchAll ? 'all-unscoped' : (userAow || 'mine');
  const cacheKey = `enquiries-v3-${email}-${userInitials}-${dateFrom}-${dateTo}-${cacheScope}`;
  let unifiedRequestSucceeded = false;
  let unifiedRequestNetworkError = false;
  
  if (!bypassCache && !forceNoCaching) {
    // Try in-memory cache first (for large datasets)
    const memCached = getMemoryCachedData<Enquiry[]>(cacheKey);
    if (memCached && (fetchAll || memCached.length > 0)) {
      if (process.env.NODE_ENV === 'development') {
        debugLog('📦 Using cached enquiries from memory:', memCached.length);
      }
      return memCached;
    }
    
    // Try localStorage cache (for smaller datasets)
    const cached = getCachedData<Enquiry[]>(cacheKey);
    if (cached && (fetchAll || cached.length > 0)) {
      return cached;
    }
  }

  // Primary source: use server-side routes to avoid browser CORS issues
  //  - Both local and production: use unified route for proper Ultimate_Source -> source mapping
  let enquiries: Enquiry[] = [];
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  try {
    const params = new URLSearchParams();
    if (email) params.set('email', email.toLowerCase());
    if (userInitials) params.set('initials', userInitials.toLowerCase());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('includeTeamInbox', 'true');
    if (bypassCache) params.set('bypassCache', 'true'); // Pass bypass flag to server
    if (fetchAll) {
      params.set('fetchAll', 'true');
      params.set('limit', '999999'); // No effective cap for "All" view
    } else {
      params.set('limit', '999999'); // No effective cap for personal view
    }
    appendDefaultEnquiryProcessingParams(params);
    // Boot and team views now run new-only (instructions DB) by default.
    // Legacy data loads deferred after initial paint — see scheduleDeferredBootTask.
    
    const primaryUrl = `/api/enquiries-unified?${params.toString()}`;
    // Dedup: if an identical request is already in-flight, reuse it
    const result = await dedupFetchJson(
      `enq:${primaryUrl}`,
      primaryUrl,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: bypassCache ? 'no-store' : 'default',
      },
    );
    if (result.ok) {
      unifiedRequestSucceeded = true;
      const data = result.data;
      let raw: any[] = [];
      if (Array.isArray(data)) {
        raw = data;
      } else if (Array.isArray(data.enquiries)) {
        raw = data.enquiries;
      } else if (Array.isArray((data as any).data)) {
        raw = (data as any).data;
      }

      // Server already filtered, just normalize the data
      enquiries = raw.map(enq => ({
        ID: (enq as any).ID || (enq as any).id || String(Math.random()),
        Date_Created: (enq as any).Date_Created || (enq as any).date_created || (enq as any).datetime,
        Touchpoint_Date: (enq as any).Touchpoint_Date || (enq as any).touchpoint_date || (enq as any).datetime,
        Email: (enq as any).Email || (enq as any).email,
        Area_of_Work: (enq as any).Area_of_Work || (enq as any).area_of_work || (enq as any).aow,
        Type_of_Work: (enq as any).Type_of_Work || (enq as any).type_of_work || (enq as any).tow,
        Method_of_Contact: (enq as any).Method_of_Contact || (enq as any).method_of_contact || (enq as any).moc,
        Point_of_Contact: (enq as any).Point_of_Contact || (enq as any).poc,
        First_Name: (enq as any).First_Name || (enq as any).first_name || (enq as any).first,
        Last_Name: (enq as any).Last_Name || (enq as any).last_name || (enq as any).last,
        Phone_Number: (enq as any).Phone_Number || (enq as any).phone_number || (enq as any).phone,
        Company: (enq as any).Company || (enq as any).company,
        Value: (enq as any).Value || (enq as any).value,
        Rating: (enq as any).Rating || (enq as any).rating,
        // Ensure notes are preserved from both legacy and new space
        Initial_first_call_notes: (enq as any).Initial_first_call_notes || (enq as any).notes || (enq as any).Notes || '',
        notes: (enq as any).notes || (enq as any).Notes || (enq as any).Initial_first_call_notes || '',
        ...enq
      })) as Enquiry[];
    } else if (result.status === 304 && !bypassCache && !forceNoCaching) {
      const memCached = getMemoryCachedData<Enquiry[]>(cacheKey);
      if (memCached) {
        enquiries = memCached;
      } else {
        const cached = getCachedData<Enquiry[]>(cacheKey);
        if (cached) {
          enquiries = cached;
        }
      }
    } else if (result.networkError) {
      unifiedRequestNetworkError = true;
    }
  } catch {
    // non-blocking; fallback below
  }

  if (!fetchAll && !bypassCache && enquiries.length === 0 && !unifiedRequestNetworkError) {
    return fetchEnquiries(email, dateFrom, dateTo, userAow, userInitials, fetchAll, true);
  }

  // If unified call failed (e.g. ECONNREFUSED during boot), retry once after a short delay
  if (!unifiedRequestSucceeded && enquiries.length === 0 && !unifiedRequestNetworkError) {
    try {
      await new Promise(r => setTimeout(r, 1500));
      return fetchEnquiries(email, dateFrom, dateTo, userAow, userInitials, fetchAll, true);
    } catch {
      // retry also failed — continue with empty set
    }
  }

  // Filter out enquiries with placeholder emails that cause false duplicates
  // These emails get reused for different people, making IDs unreliable
  const placeholderEmails = ['noemail@noemail.com', 'prospects@helix-law.com'];
  const validEnquiries = enquiries.filter((e: any) => {
    const email = (e.Email || e.email || '').toLowerCase();
    return !placeholderEmails.includes(email);
  });

  // De-duplicate by ID + Week to avoid duplicates when sources overlap
  // Same person with enquiries in different weeks are kept separate (genuinely distinct matters)
  // Multiple calls within the same week are treated as one enquiry (follow-ups)
  if (Array.isArray(validEnquiries) && validEnquiries.length > 1) {
    const seen = new Set<string>();
    const deduped: Enquiry[] = [] as unknown as Enquiry[];
    for (const e of validEnquiries as unknown as any[]) {
      const id = (e && (e.ID || e.id)) ? String(e.ID || e.id) : '';
      const dateStr = (e && (e.Touchpoint_Date || e.datetime)) ? String(e.Touchpoint_Date || e.datetime).split('T')[0] : '';
      
      // Calculate ISO week number (year + week) for consistent deduplication
      let weekKey = '';
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          // Get Monday of the week
          const dayOfWeek = d.getDay() || 7; // Sunday = 7
          const monday = new Date(d);
          monday.setDate(d.getDate() - dayOfWeek + 1);
          const weekNum = Math.ceil(((monday.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7);
          weekKey = `${year}-W${weekNum}`;
        }
      }
      
      const key = `${id}|${weekKey}`;
      if (!id || !seen.has(key)) {
        if (id) seen.add(key);
        deduped.push(e as Enquiry);
      }
    }
    enquiries = deduped;
  } else {
    enquiries = validEnquiries;
  }

  // Apply area-of-work filtering based on user's AOW (only for unclaimed enquiries)
  let filteredEnquiries = enquiries;
  if (!fetchAll && userAow) {
    const userAreas = userAow
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    const hasFullAccess = userAreas.some(
      (a) => a.includes('operations') || a.includes('tech'),
    );
    if (!hasFullAccess) {
      const unclaimedEmails = ['team@helix-law.com'];
      filteredEnquiries = enquiries.filter((enq) => {
        const pocEmail = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
        const isUnclaimed = unclaimedEmails.includes(pocEmail) || pocEmail === 'team';
        if (!isUnclaimed) {
          return true; // keep claimed enquiries regardless of area
        }
        const area = (enq.Area_of_Work || (enq as any).aow || '').toLowerCase();
        return userAreas.some(
          (a) => a === area || a.includes(area) || area.includes(a),
        );
      });
    }
  }

  // Temporarily disable caching in development to test server fixes
  if (!forceNoCaching) {
    // Try localStorage first, fallback to in-memory if too large
    const success = setCachedData(cacheKey, filteredEnquiries);
    if (!success) {
      // If localStorage failed (too large), use in-memory cache instead
      setMemoryCachedData(cacheKey, filteredEnquiries);
      if (process.env.NODE_ENV === 'development') {
        debugLog('✅ Cached', filteredEnquiries.length, 'enquiries in memory');
      }
    }
  } else if (process.env.NODE_ENV === 'development') {
    debugLog('🚫 Caching disabled - using fresh data:', filteredEnquiries.length, 'enquiries');
  }
  
  return filteredEnquiries;
}

// Helper functions for mapping matter data from different sources
const mapLegacyMatters = (items: any[]): Matter[] => {
  return items.map((item) => ({
    MatterID: item["MatterID"] || item["Matter ID"] || "",
    InstructionRef: item["InstructionRef"] || item["Instruction Ref"] || "",
    DisplayNumber: item["Display Number"] || "",
    OpenDate: item["Open Date"] || "",
    MonthYear: item["MonthYear"] || "",
    YearMonthNumeric: item["YearMonthNumeric"] || 0,
    ClientID: item["Client ID"] || "",
    ClientName: item["Client Name"] || "",
    ClientPhone: item["Client Phone"] || "",
    ClientEmail: item["Client Email"] || "",
    Status: item["Status"] || "",
    UniqueID: item["Unique ID"] || "",
    Description: item["Description"] || "",
    PracticeArea: item["Practice Area"] || "",
    Source: item["Source"] || "",
    Referrer: item["Referrer"] || "",
    ResponsibleSolicitor: item["Responsible Solicitor"] || "",
    OriginatingSolicitor: item["Originating Solicitor"] || "",
    SupervisingPartner: item["Supervising Partner"] || "",
    Opponent: item["Opponent"] || "",
    OpponentSolicitor: item["Opponent Solicitor"] || "",
    CloseDate: item["Close Date"] || "",
    ApproxValue: item["Approx. Value"] || "",
    mod_stamp: item["mod_stamp"] || "",
    method_of_contact: item["method_of_contact"] || "",
    CCL_date: item["CCL_date"] || null,
    Rating: item["Rating"] as "Good" | "Neutral" | "Poor" | undefined,
  }));
};

async function fetchAllMatters(): Promise<Matter[]> {
  // Deprecated: the local Express server intentionally returns 410 for `/api/getAllMatters`
  // (it was removed in favour of `/api/matters-unified`).
  // Keeping this function as a safe no-op avoids noisy 410 network errors in devtools.
  return [];
}

async function fetchMatters(fullName: string): Promise<Matter[]> {
  const cacheKey = `matters-${fullName}`;
  const cached = getCachedData<Matter[]>(cacheKey);
  if (cached) return cached;

  const legacyUrl = '/api/getMatters';

  let legacyData: any[] = [];

  try {
    const response = await fetch(legacyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName }),
    });
    if (!response.ok) throw new Error(`Failed to fetch matters: ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data)) legacyData = data;
    else if (Array.isArray(data.matters)) legacyData = data.matters;
  } catch (err) {
    console.warn('Legacy matters fetch failed', err);
  }

  let fetchedMatters = mapLegacyMatters(legacyData);

  if (fetchedMatters.length === 0) {
    const { default: localMatters } = await import('./localData/localMatters.json');
    fetchedMatters = mapLegacyMatters(localMatters as unknown as any[]);
  }

  setCachedData(cacheKey, fetchedMatters);
  return fetchedMatters;
}

async function fetchVNetMatters(fullName?: string): Promise<any[]> {
  const cacheKey = fullName ? `vnetMatters-${fullName}` : 'vnetMatters-all';
  const cached = getCachedData<any[]>(cacheKey);
  if (cached) return cached;
  const newUrl = '/api/getMatters';
  let vnetData: any[] = [];

  try {
    // Support optional fullName filter (POST is also accepted by the route, but GET keeps caching simpler)
    const params = fullName ? `?fullName=${encodeURIComponent(fullName)}` : '';
    const resNew = await fetch(`${newUrl}${params}`, { method: 'GET' });
    if (resNew.ok) {
      const data = await resNew.json();
      vnetData = Array.isArray(data) ? data : data.matters || [];
      
    } else {
      console.warn('❌ VNet matters fetch failed:', resNew.status, resNew.statusText);
    }
  } catch (err) {
    console.warn('VNet matters fetch error', err);
  }

  setCachedData(cacheKey, vnetData);
  return vnetData;
}

// (removed) legacy v4 fetchAllMatterSources in favor of unified v5
  async function fetchUnifiedMattersWithTimeout(url: string, timeoutMs: number, dedupKey: string): Promise<any> {
    const controller = new AbortController();
    const warnId = window.setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn('[Matters] /api/matters-unified still pending…');
    }, 10_000);
    const timeoutId = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await dedup(dedupKey, async () => {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    } finally {
      window.clearTimeout(warnId);
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function fetchAllMatterSources(fullName: string, queryFullName?: string): Promise<NormalizedMatter[]> {
    // v6 cache key: new-space-only server endpoint
    // Use in-memory cache instead of localStorage (matters data is too large)
    const cacheKey = `normalizedMatters-v6-new-space-${fullName}`;
    const cached = getMemoryCachedData<NormalizedMatter[]>(cacheKey);
    if (cached) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.info(`Matters cache hit (${cached.length} items)`);
      }
      return cached;
    }

    try {
      const trimmedQueryName = queryFullName?.trim();
      const query = trimmedQueryName ? `?fullName=${encodeURIComponent(trimmedQueryName)}` : '';
      const url = `/api/matters-new-space${query}`;
      let data: any;
      try {
        data = await fetchUnifiedMattersWithTimeout(url, 45_000, `mat:${url}`);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // eslint-disable-next-line no-console
          console.warn('[Matters] new-space fetch timed out, retrying once with extended timeout');
          data = await fetchUnifiedMattersWithTimeout(url, 120_000, `mat:${url}:retry`);
        } else {
          throw err;
        }
      }
      const newSpaceMatters = Array.isArray(data.matters) ? data.matters : [];
      const normalizedMatters = newSpaceMatters.map((matter: any) => normalizeMatterData(matter, fullName, 'vnet_direct'));
      
      // Cache in memory instead of localStorage (too large for localStorage)
      setMemoryCachedData(cacheKey, normalizedMatters);
      
      return normalizedMatters;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Matters] new-space fetch failed', err);
      return [];
    }
  }

async function fetchTeamData(): Promise<TeamData[] | null> {
  const cacheKey = "teamData";
  const cached = getCachedData<TeamData[]>(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV === 'development') {
      debugLog('📦 Using cached team data:', cached.length, 'members');
    }
    return cached;
  }
  try {
    const response = await dedup('team-data', () => fetch(
      `/api/team-data`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    ).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch team data: ${r.statusText}`);
      return r.json();
    }));
    const data: TeamData[] = response;
    
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    console.error("❌ Error fetching team data:", error);
    return null;
  }
}

function getCachedEnquiriesSnapshot(
  email: string,
  dateFrom: string,
  dateTo: string,
  userAow: string = '',
  userInitials: string = '',
  fetchAll: boolean = false,
): Enquiry[] | null {
  const cacheScope = fetchAll ? 'all-unscoped' : (userAow || 'mine');
  const cacheKey = `enquiries-v3-${email}-${userInitials}-${dateFrom}-${dateTo}-${cacheScope}`;
  const memCached = getMemoryCachedData<Enquiry[]>(cacheKey);
  if (memCached && (fetchAll || memCached.length > 0)) {
    return memCached;
  }

  const cached = getCachedData<Enquiry[]>(cacheKey);
  if (cached && (fetchAll || cached.length > 0)) {
    return cached;
  }

  return null;
}

function resolveEffectiveDatasetUser(
  user: UserData | null | undefined,
  team: TeamData[] | null | undefined,
): {
  email: string;
  initials: string;
  fullName: string;
  entraId: string;
  clioId: string;
} {
  const email = String(user?.Email || '').trim();
  const initials = String(user?.Initials || '').trim().toUpperCase();
  const fullName = String(user?.FullName || `${user?.First || ''} ${user?.Last || ''}`.trim()).trim();
  const entraId = String((user as any)?.['Entra ID'] || user?.EntraID || '').trim();
  const clioId = String((user as any)?.['Clio ID'] || user?.ClioID || '').trim();

  return { email, initials, fullName, entraId, clioId };
}

// Main component
const AppWithContext: React.FC = () => {
  // Wayfinding + dev server-bounce reconnect (no-ops in production).
  useDevServerBoot();

  const [teamsContext, setTeamsContext] =
    useState<app.Context | null>(null);
  const [userData, setUserData] = useState<UserData[] | null>(null);
  const [originalAdminUser, setOriginalAdminUser] = useState<UserData | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [matters, setMatters] = useState<NormalizedMatter[]>([]);
  const [teamData, setTeamData] = useState<TeamData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEntryGate, setShowEntryGate] = useState(false);
  const [enquiriesUsingSnapshot, setEnquiriesUsingSnapshot] = useState(false);
  const [enquiriesLiveRefreshInFlight, setEnquiriesLiveRefreshInFlight] = useState(false);
  const [lastEnquiriesLiveSyncAt, setLastEnquiriesLiveSyncAt] = useState<number | null>(null);

  // Avoid over-flushing server cache during rapid refresh bursts (e.g. SSE-driven refresh).
  const lastEnquiriesCacheFlushAtRef = React.useRef<number>(0);
  const appEnquiriesRefreshTimerRef = React.useRef<number | null>(null);
  const appEnquiriesRefreshInFlightRef = React.useRef(false);
  const appEnquiriesRefreshQueuedRef = React.useRef(false);
  const refreshEnquiriesInFlightRef = React.useRef<Promise<void> | null>(null);
  const refreshEnquiriesQueuedRef = React.useRef(false);
  const refreshEnquiriesRef = React.useRef<() => Promise<void>>(async () => {});
  const optimisticClaimEnquiryRef = React.useRef<(enquiryId: string, claimerEmail: string) => void>(() => {});
  const bgReconcileTimerRef = React.useRef<number | null>(null);

  // Realtime event distribution — app shell is sole SSE owner; downstream tabs subscribe.
  type EnquiryRealtimeEvent = {
    changeType: string;
    enquiryId: string;
    claimedBy?: string;
    claimedAt?: string | null;
    deletedIds?: string[];
    record?: Record<string, unknown>;
  };
  const enquiryEventListenersRef = React.useRef<Set<(event: EnquiryRealtimeEvent) => void>>(new Set());
  const subscribeToEnquiryStream = React.useCallback(
    (listener: (event: EnquiryRealtimeEvent) => void) => {
      enquiryEventListenersRef.current.add(listener);
      return () => { enquiryEventListenersRef.current.delete(listener); };
    },
    [],
  );

  // Pipeline event distribution — instruction/deal/matter lifecycle events.
  type PipelineRealtimeEvent = {
    eventType: string;
    entityId: string;
    entityType: string;
    field: string;
    status: string;
    source: string;
    timestamp: string;
    data?: Record<string, unknown>;
  };
  const pipelineEventListenersRef = React.useRef<Set<(event: PipelineRealtimeEvent) => void>>(new Set());
  const pipelineEventDedupRef = React.useRef<Map<string, number>>(new Map());
  const subscribeToPipelineStream = React.useCallback(
    (listener: (event: PipelineRealtimeEvent) => void) => {
      pipelineEventListenersRef.current.add(listener);
      return () => { pipelineEventListenersRef.current.delete(listener); };
    },
    [],
  );

  // SSE connection state for freshness indicator
  const [sseConnectionState, setSseConnectionState] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [lastPipelineEventAt, setLastPipelineEventAt] = useState<number | null>(null);

  // Local development state for area selection
  const [localSelectedAreas, setLocalSelectedAreas] = useState<string[]>(['Commercial', 'Construction', 'Property']);

  useLayoutEffect(() => {
    const activeUser = normalizeUserRecord(userData?.[0] || null);
    if (activeUser) {
      writeRequestAuthContext(activeUser);
      return;
    }

    clearRequestAuthContext();
  }, [userData]);

  // Refresh enquiries function - can be called after claiming an enquiry
  const refreshEnquiries = async () => {
    if (!userData || !userData[0]) return;

    if (refreshEnquiriesInFlightRef.current) {
      refreshEnquiriesQueuedRef.current = true;
      return refreshEnquiriesInFlightRef.current;
    }
    
    const runRefresh = async () => {
      setEnquiriesLiveRefreshInFlight(true);
      actionLog.start('Enquiries refresh');

      try {
        // Flush server-side enquiries cache before fetching fresh data
        try {
          const now = Date.now();
          const shouldFlush = now - lastEnquiriesCacheFlushAtRef.current > 15000;
          if (shouldFlush) {
            lastEnquiriesCacheFlushAtRef.current = now;
            await fetch('/api/cache/clear-cache', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope: 'enquiries' })
            });
          }
        } catch (flushErr) {
          console.warn('Cache flush failed (non-blocking):', flushErr);
        }

        const { dateFrom, dateTo } = getDateRange();
        const effectiveUser = resolveEffectiveDatasetUser(userData[0], teamData);
        const userEmail = effectiveUser.email;
        // Don't apply AOW filtering when admin has switched users - show all enquiries like Management Dashboard
        const userAow = originalAdminUser ? "" : (userData[0].AOW || "");
        const userInitials = effectiveUser.initials;

        const adminFetchAll = isDevOwner(userData[0]) && !originalAdminUser;
        const enquiriesRes = await fetchEnquiries(userEmail, dateFrom, dateTo, userAow, userInitials, adminFetchAll, true);
        setEnquiries(enquiriesRes);
        setLastEnquiriesLiveSyncAt(Date.now());
        setEnquiriesUsingSnapshot(false);
        actionLog.end('Enquiries refresh', `${enquiriesRes.length} rows`);
      } catch (error) {
        console.error('❌ Error refreshing enquiries:', error);
        actionLog.warn('Enquiries refresh failed');
      } finally {
        refreshEnquiriesInFlightRef.current = null;
        setEnquiriesLiveRefreshInFlight(false);
        if (refreshEnquiriesQueuedRef.current) {
          refreshEnquiriesQueuedRef.current = false;
          void refreshEnquiries();
        }
      }
    };

    const refreshPromise = runRefresh();
    refreshEnquiriesInFlightRef.current = refreshPromise;
    return refreshPromise;
  };

    const scheduleBootEnquiriesLiveRefresh = (options: {
      stage: 'teams' | 'gate' | 'local';
      entry: string;
      email: string;
      initials: string;
      userAow: string;
      fetchAll: boolean;
      dateFrom: string;
      dateTo: string;
      restoredSnapshot?: boolean;
      restoredCache?: boolean;
    }) => {
      scheduleDeferredBootTask(() => {
        const startedAt = performance.now();
        setEnquiriesLiveRefreshInFlight(true);
        trackBootStage(options.stage, 'enquiries-live', 'started', {
          entry: options.entry,
          restoredSnapshot: Boolean(options.restoredSnapshot),
          restoredCache: Boolean(options.restoredCache),
          fetchAll: options.fetchAll,
        });

        void fetchEnquiries(
          options.email,
          options.dateFrom,
          options.dateTo,
          options.userAow,
          options.initials,
          options.fetchAll,
          true,
        )
          .then((res) => {
            const durationMs = Math.round(performance.now() - startedAt);
            setEnquiries(res);
            setLastEnquiriesLiveSyncAt(Date.now());
            setEnquiriesUsingSnapshot(false);
            trackBootStage(options.stage, 'enquiries-live', 'completed', {
              entry: options.entry,
              restoredSnapshot: Boolean(options.restoredSnapshot),
              restoredCache: Boolean(options.restoredCache),
              fetchAll: options.fetchAll,
              enquiriesCount: Array.isArray(res) ? res.length : 0,
            }, {
              duration: durationMs,
            });
          })
          .catch((error) => {
            const durationMs = Math.round(performance.now() - startedAt);
            console.warn(`[Boot:${options.entry}] Deferred live enquiries refresh failed:`, error);
            trackBootStage(options.stage, 'enquiries-live', 'failed', {
              entry: options.entry,
              restoredSnapshot: Boolean(options.restoredSnapshot),
              restoredCache: Boolean(options.restoredCache),
              fetchAll: options.fetchAll,
            }, {
              duration: durationMs,
              error: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            setEnquiriesLiveRefreshInFlight(false);
          });
      });
    };

  /**
   * Optimistically update a claimed enquiry in local state.
   * This provides instant UI feedback by moving the enquiry from unclaimed to claimed.
   * @param enquiryId The ID of the enquiry being claimed
   * @param claimerEmail The email of the user claiming the enquiry
   */
  const optimisticClaimEnquiry = (enquiryId: string, claimerEmail: string) => {
    setEnquiries(prev => {
      if (!prev) return prev;
      return prev.map(enq => {
        // Match on ID (could be string or number comparison)
        const enqId = String(enq.ID || (enq as any).id || '');
        if (enqId === String(enquiryId)) {
          return {
            ...enq,
            Point_of_Contact: claimerEmail,
            poc: claimerEmail,
            // Also update stage if it exists
            stage: (enq as any).stage === 'new' ? 'claimed' : (enq as any).stage,
          };
        }
        return enq;
      });
    });
  };

  /**
   * Patch a single enquiry record in local state from SSE event data.
   * Normalizes field aliases so both legacy and new-schema keys stay consistent.
   */
  const patchEnquiry = (enquiryId: string, updates: Record<string, unknown>) => {
    if (!enquiryId || !updates || Object.keys(updates).length === 0) return;
    // Build normalized updates with both legacy and new-schema aliases
    const patch: Record<string, unknown> = { ...updates };
    if ('First_Name' in updates) patch.first = updates.First_Name;
    if ('Last_Name' in updates) patch.last = updates.Last_Name;
    if ('Point_of_Contact' in updates) patch.poc = updates.Point_of_Contact;
    if ('Area_of_Work' in updates) patch.aow = updates.Area_of_Work;
    if ('Email' in updates) patch.email = updates.Email;
    if ('Initial_first_call_notes' in updates) patch.notes = updates.Initial_first_call_notes;
    if ('Value' in updates) patch.value = updates.Value;
    if ('Rating' in updates) patch.rating = updates.Rating;

    setEnquiries(prev => {
      if (!prev) return prev;
      return prev.map(enq => {
        const enqId = String(enq.ID || (enq as any).id || '');
        if (enqId === String(enquiryId)) {
          return { ...enq, ...patch };
        }
        return enq;
      });
    });
  };

  /**
   * Schedule a silent background reconciliation — fetches fresh data without visible
   * loading indicators. Used after SSE patches to catch any drift.
   */
  const scheduleBackgroundReconciliation = React.useCallback((delayMs: number = 30000) => {
    if (bgReconcileTimerRef.current) {
      window.clearTimeout(bgReconcileTimerRef.current);
    }
    bgReconcileTimerRef.current = window.setTimeout(() => {
      bgReconcileTimerRef.current = null;
      refreshEnquiriesRef.current().catch(() => {});
    }, delayMs);
  }, []);

  useEffect(() => {
    refreshEnquiriesRef.current = refreshEnquiries;
  }, [refreshEnquiries]);

  useEffect(() => {
    optimisticClaimEnquiryRef.current = optimisticClaimEnquiry;
  }, [optimisticClaimEnquiry]);

  useEffect(() => {
    if (!userData?.[0]) return;

    let eventSource: EventSource | null = null;

    const onChangedEvent = (ev: Event) => {
      let payload: any = null;
      try {
        const messageEvent = ev as MessageEvent;
        payload = typeof messageEvent?.data === 'string' ? JSON.parse(messageEvent.data) : null;
      } catch {
        payload = null;
      }

      const changeType = String(payload?.changeType || 'changed');
      const enquiryId = String(payload?.enquiryId || '');
      const deletedIds = Array.isArray(payload?.deletedIds)
        ? payload.deletedIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)
        : [];
      const record = payload?.record && typeof payload.record === 'object' ? payload.record : undefined;

      // Broadcast event (with record data) to downstream subscribers (Enquiries tab, etc.)
      const eventDetail: EnquiryRealtimeEvent = {
        changeType,
        enquiryId,
        claimedBy: payload?.claimedBy != null ? String(payload.claimedBy) : undefined,
        claimedAt: typeof payload?.claimedAt === 'string' ? payload.claimedAt : null,
        deletedIds,
        record,
      };
      enquiryEventListenersRef.current.forEach(fn => {
        try { fn(eventDetail); } catch { /* ignore downstream errors */ }
      });

      // ── Patch-first approach: apply local patches immediately, reconcile later ──

      if (changeType === 'claim' && enquiryId) {
        const claimedBy = String(payload?.claimedBy || '');
        if (claimedBy) {
          optimisticClaimEnquiryRef.current(enquiryId, claimedBy);
        }
        // Background reconciliation — no visible refetch
        scheduleBackgroundReconciliation(30000);
        return;
      }

      if (changeType === 'update' && enquiryId && record) {
        // Apply field-level patch from SSE — instant UI update
        patchEnquiry(enquiryId, record);
        scheduleBackgroundReconciliation(30000);
        return;
      }

      if (changeType === 'create') {
        // New record — needs full refresh to pick up the row, but delayed
        scheduleBackgroundReconciliation(5000);
        return;
      }

      if (changeType === 'delete' && enquiryId) {
        const candidateIds = new Set<string>([String(enquiryId).trim(), ...deletedIds].filter(Boolean));
        // Remove deleted record from local state immediately
        setEnquiries(prev => {
          if (!prev) return prev;
          return prev.filter(enq => !Array.from(candidateIds).some((candidateId) => enquiryReferencesId(enq, candidateId)));
        });
        // Purge all client caches so stale data can't resurface on re-render/refresh
        clearClientEnquiriesCaches();
        // Reconcile immediately against the live server response so any missed linked-ID
        // row is overwritten without waiting for the normal delayed refresh.
        scheduleBackgroundReconciliation(400);
        return;
      }

      // Fallback for unknown event types — gentle background reconciliation
      scheduleBackgroundReconciliation(10000);
    };

    // Pipeline event handler — instruction/deal/matter lifecycle events.
    // Broadcasts to downstream subscribers (InstructionsTab, etc.) for instant UI patches.
    const onPipelineEvent = (ev: Event) => {
      let payload: PipelineRealtimeEvent | null = null;
      try {
        const messageEvent = ev as MessageEvent;
        payload = typeof messageEvent?.data === 'string' ? JSON.parse(messageEvent.data) : null;
      } catch {
        payload = null;
      }
      if (!payload) return;

      const event: PipelineRealtimeEvent = {
        eventType: String(payload.eventType || ''),
        entityId: String(payload.entityId || ''),
        entityType: String(payload.entityType || ''),
        field: String(payload.field || ''),
        status: String(payload.status || ''),
        source: String(payload.source || ''),
        timestamp: String(payload.timestamp || ('ts' in (payload as unknown as Record<string, unknown>) ? (payload as unknown as Record<string, unknown>).ts : '') || ''),
        data: payload.data && typeof payload.data === 'object' ? payload.data : undefined,
      };

      // Dedup: skip if we've already processed this exact event within 60s
      const dedupKey = `${event.entityId}::${event.eventType}::${event.timestamp}`;
      const dedupMap = pipelineEventDedupRef.current;
      const now = Date.now();
      if (dedupMap.has(dedupKey)) return;
      dedupMap.set(dedupKey, now);
      // Prune entries older than 60s
      if (dedupMap.size > 50) {
        const cutoff = now - 60000;
        for (const [k, ts] of dedupMap) {
          if (ts < cutoff) dedupMap.delete(k);
        }
      }

      setLastPipelineEventAt(now);

      pipelineEventListenersRef.current.forEach(fn => {
        try { fn(event); } catch { /* ignore downstream errors */ }
      });

      // R7 B4/B7: relay to a window event so any tile (Home pulse, activity
      // feed, etc.) can subscribe without holding its own EventSource.
      try {
        window.dispatchEvent(new CustomEvent('helix:enquiriesChanged', { detail: event }));
      } catch { /* ignore */ }
    };

    try {
      eventSource = new EventSource('/api/enquiries-unified/stream');
      eventSource.addEventListener('enquiries.changed', onChangedEvent as EventListener);
      eventSource.addEventListener('pipeline.changed', onPipelineEvent as EventListener);
      actionLog('SSE connected', 'enquiries realtime stream');
      eventSource.onopen = () => {
        setSseConnectionState('live');
      };
      eventSource.onerror = () => {
        setSseConnectionState('error');
        // Browser will auto-retry; keep handler light.
        trackClientEvent('AppShell', 'enquiries-stream-error', { readyState: eventSource?.readyState ?? -1 }, {
          throttleKey: 'app:enquiries-stream-error',
          cooldownMs: 15000,
        });
      };
      trackClientEvent('AppShell', 'enquiries-stream-connected', { path: '/api/enquiries-unified/stream' }, {
        throttleKey: 'app:enquiries-stream-connected',
        cooldownMs: 60000,
      });
    } catch (error) {
      console.warn('[App] Failed to connect enquiries realtime stream:', error);
      trackClientError('AppShell', 'enquiries-stream-connect-failed', error, { path: '/api/enquiries-unified/stream' }, {
        throttleKey: 'app:enquiries-stream-connect-failed',
        cooldownMs: 30000,
      });
    }

    // Dev HMR: close the SSE before webpack swaps this module so we don't
    // dangle behind the proxy `timeout: 0`. No-op in production.
    const undoHmr = disposeOnHmr(() => { try { eventSource?.close(); } catch { /* */ } });

    // Dev: when the local backend restarts (nodemon), reconnect immediately
    // instead of waiting for the browser's EventSource auto-retry to notice.
    const undoBounce = onServerBounced(() => {
      try { eventSource?.close(); } catch { /* */ }
      try {
        eventSource = new EventSource('/api/enquiries-unified/stream');
        eventSource.addEventListener('enquiries.changed', onChangedEvent as EventListener);
        eventSource.addEventListener('pipeline.changed', onPipelineEvent as EventListener);
        eventSource.onopen = () => setSseConnectionState('live');
        eventSource.onerror = () => setSseConnectionState('error');
      } catch { /* */ }
    });

    return () => {
      if (bgReconcileTimerRef.current) {
        window.clearTimeout(bgReconcileTimerRef.current);
        bgReconcileTimerRef.current = null;
      }
      if (appEnquiriesRefreshTimerRef.current) {
        window.clearTimeout(appEnquiriesRefreshTimerRef.current);
        appEnquiriesRefreshTimerRef.current = null;
      }
      appEnquiriesRefreshQueuedRef.current = false;
      appEnquiriesRefreshInFlightRef.current = false;
      try {
        if (eventSource) {
          eventSource.removeEventListener('enquiries.changed', onChangedEvent as EventListener);
          eventSource.removeEventListener('pipeline.changed', onPipelineEvent as EventListener);
          eventSource.close();
        }
      } catch {
        // ignore
      }
      undoHmr();
      undoBounce();
    };
  }, [userData]);

  // Refresh matters function - clears local caches and fetches normalized matters for current user
  const refreshMatters = React.useCallback(async () => {
    if (!userData || !userData[0]) return;
    actionLog.start('Matters refresh');

    try {
      // Clear localStorage caches related to matters
      const keys = Object.keys(localStorage);
      const toRemove = keys.filter(k => {
        const lower = k.toLowerCase();
        return (
          lower.startsWith('normalizedmatters-v5-') ||
          lower.startsWith('vnetmatters-') ||
          lower.startsWith('matters-') ||
          lower === 'allmatters'
        );
      });
      toRemove.forEach(k => localStorage.removeItem(k));

      const effectiveUser = resolveEffectiveDatasetUser(userData[0], teamData);
      const queryName = isDevOwner(userData[0]) ? '' : effectiveUser.fullName;
      const normalized = await fetchAllMatterSources(effectiveUser.fullName, queryName);
      setMatters(normalized);
      actionLog.end('Matters refresh', `${normalized.length} rows`);
    } catch (err) {
      console.error('❌ Error refreshing matters:', err);
      actionLog.warn('Matters refresh failed');
    }
  }, [userData, teamData]);

  // Pipeline SSE → patch matters in-place (same pattern as instruction patching in App.tsx).
  // Reacts to matter.opened / matter.closed events so the Matters tab updates without manual refresh.
  React.useEffect(() => {
    const unsubscribe = subscribeToPipelineStream((event) => {
      const { entityId, field, eventType, status, data } = event;
      if (!entityId || field !== 'matter') return;

      setMatters(prev => {
        if (!prev || prev.length === 0) return prev;

        // Try to find and patch an existing matter
        let changed = false;
        const next = prev.map(matter => {
          const matches =
            matter.displayNumber === entityId ||
            matter.instructionRef === entityId ||
            matter.matterId === entityId;
          if (!matches) return matter;

          changed = true;

          if (eventType === 'matter.opened') {
            return {
              ...matter,
              status: 'active' as const,
              originalStatus: status || 'Active',
              openDate: (data as any)?.openDate || matter.openDate,
            };
          }

          if (eventType === 'matter.closed') {
            return {
              ...matter,
              status: 'closed' as const,
              originalStatus: status || 'Closed',
              closeDate: (data as any)?.closeDate || new Date().toISOString(),
            };
          }

          // Generic status update
          return {
            ...matter,
            originalStatus: status || matter.originalStatus,
          };
        });

        // If no match found but it's a new matter opening, append it
        if (!changed && eventType === 'matter.opened' && data) {
          const matterData = data as Record<string, unknown>;
          const displayNumber = String(matterData.displayNumber || matterData.display_number || entityId);
          // Only append if we have enough data to render
          if (displayNumber && matterData.clientName) {
            const newMatter: NormalizedMatter = {
              matterId: String(matterData.clioMatterId || matterData.matterId || ''),
              matterName: String(matterData.description || ''),
              displayNumber,
              instructionRef: String(matterData.instructionRef || entityId),
              openDate: String(matterData.openDate || new Date().toISOString()),
              closeDate: null,
              status: 'active',
              originalStatus: status || 'Active',
              clientId: String(matterData.clientId || ''),
              clientName: String(matterData.clientName || ''),
              description: String(matterData.description || ''),
              practiceArea: String(matterData.practiceArea || ''),
              responsibleSolicitor: String(matterData.responsibleSolicitor || ''),
              originatingSolicitor: String(matterData.originatingSolicitor || ''),
              role: 'none',
              dataSource: 'vnet_direct',
            };
            return [...prev, newMatter];
          }
        }

        return changed ? next : prev;
      });
    });

    return unsubscribe;
  }, [subscribeToPipelineStream]);

  // 2026-04-24: realtime safety net for matters across the whole app.
  //
  // The pipeline SSE only patches matters opened *in this session*. The
  // matters SSE channel (`/api/matters/stream`) covers everything else
  // (Clio webhook, another user opening a matter, server scheduler).
  //
  // Home.tsx also subscribes for the tile pulse, but its subscription is
  // gated to `isActive` (Home being the active tab). When the user
  // navigates to the Matters tab Home goes inactive and that channel
  // closes — defeating the purpose. The shared connection registry in
  // useRealtimeChannel dedupes by URL, so adding a parallel always-on
  // subscription here keeps the single underlying EventSource alive
  // regardless of which tab is active. No extra network cost.
  //
  // Page-visibility gating: we only want to pay the cost while the tab
  // is actually visible. The browser will replay missed events on
  // reconnect (server keeps a small buffer via Last-Event-ID), and the
  // refresh on reconnect will catch any drift.
  const [isPageVisible, setIsPageVisible] = React.useState(() =>
    typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true,
  );
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setIsPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const mattersRefreshInFlight = React.useRef(false);
  const mattersRefreshTimer = React.useRef<number | null>(null);
  const requestMattersRefresh = React.useCallback(() => {
    if (mattersRefreshTimer.current != null) {
      window.clearTimeout(mattersRefreshTimer.current);
    }
    mattersRefreshTimer.current = window.setTimeout(async () => {
      mattersRefreshTimer.current = null;
      if (mattersRefreshInFlight.current) return;
      if (!userData || !userData[0]) return;
      mattersRefreshInFlight.current = true;
      try {
        await refreshMatters();
      } finally {
        mattersRefreshInFlight.current = false;
      }
    }, 600);
  }, [userData, refreshMatters]);

  // Cleanup the pending timer on unmount so we never call refresh against
  // an unmounted tree.
  React.useEffect(() => () => {
    if (mattersRefreshTimer.current != null) {
      window.clearTimeout(mattersRefreshTimer.current);
      mattersRefreshTimer.current = null;
    }
  }, []);

  // The shared registry will collapse this with Home's subscription into a
  // single EventSource. When Home unsubscribes (user on another tab), this
  // keeps it alive; when both subscribe, only one connection exists.
  useRealtimeChannel('/api/matters/stream', {
    event: 'matters.changed',
    name: 'matters-app-shell',
    enabled: !!(userData && userData[0]) && isPageVisible,
    onChange: () => {
      requestMattersRefresh();
      // Re-emit the legacy window event so other listeners (e.g. Home tile
      // pulse) still get notified independently of which subscription fires.
      try { window.dispatchEvent(new CustomEvent('helix:mattersChanged')); } catch { /* ignore */ }
    },
  });

  // Update user data when local areas change
  const updateLocalUserData = (areas: string[]) => {
    debugLog('📥 updateLocalUserData called with:', areas);
    debugLog('📝 Current userData before update:', userData?.[0]?.AOW);
    setLocalSelectedAreas(areas);
    // Allow area override for all users, not just localhost
    if (userData && userData[0]) {
      const updatedUserData = [{
        ...userData[0],
        AOW: areas.join(', ')
      }];
      debugLog('✅ Setting new userData with AOW:', updatedUserData[0].AOW);
      setUserData(updatedUserData as UserData[]);
    }
  };

  const normalizeSwitchIdentity = (user?: UserData | null) => ({
    entraId: String(user?.EntraID || (user as any)?.["Entra ID"] || '').trim().toLowerCase(),
    email: String(user?.Email || '').trim().toLowerCase(),
    fullName: String(user?.FullName || (user as any)?.["Full Name"] || '').trim().toLowerCase(),
    initials: String(user?.Initials || '').trim().toUpperCase(),
  });

  const isSameSwitchIdentity = (left?: UserData | null, right?: UserData | null) => {
    const a = normalizeSwitchIdentity(left);
    const b = normalizeSwitchIdentity(right);
    if (a.entraId && b.entraId) return a.entraId === b.entraId;
    if (a.email && b.email) return a.email === b.email;
    if (a.fullName && b.fullName) return a.fullName === b.fullName;
    return !!a.initials && !!b.initials && a.initials === b.initials;
  };

  // Allow switching user in production for specific users
  const switchUser = async (newUser: UserData) => {
    actionLog.start('User switch', `→ ${newUser.Initials || newUser.First || 'unknown'}`);
    setLoading(true);

    const normalized = normalizeUserRecord(newUser) as UserData;
    const hydratedUser = await hydrateUserProfile(normalized).catch(() => normalized);
    const activeUser = (hydratedUser || normalized) as UserData;
    writeRequestAuthContext(activeUser);
    const returningToOriginalAdmin = !!originalAdminUser && isSameSwitchIdentity(normalized, originalAdminUser);

    // Store the current admin user only when moving away from the original identity.
    if (!originalAdminUser && userData && userData[0] && !isSameSwitchIdentity(normalized, userData[0])) {
      setOriginalAdminUser(userData[0]);
    }
    if (returningToOriginalAdmin) {
      setOriginalAdminUser(null);
    }

    setUserData([activeUser]);
    const liveTeam = teamData ?? await fetchTeamData().catch(() => null);
    if (liveTeam && liveTeam !== teamData) {
      setTeamData(liveTeam);
    }
    const effectiveUser = resolveEffectiveDatasetUser(activeUser, liveTeam);
    const activeOriginalAdminUser = returningToOriginalAdmin ? null : originalAdminUser;
    


    
    // Clear only essential caches when switching users (less aggressive for performance)
    const keysToRemove = Object.keys(localStorage).filter(key => {
      const k = key.toLowerCase();
      return (
        k.includes('enquiries-') ||
        k.includes('userdata-')
        // Keep matters cache to avoid refetching - matters don't change often
      );
    });
    keysToRemove.forEach(key => localStorage.removeItem(key));

    
    try {
      // Always fetch matters for the selected user.
      // Matters can be user-scoped server-side (queryName), so reusing a previously-loaded
      // matters list will show the wrong "Mine" results after switching user.
      const queryName = isDevOwner(normalized) && !activeOriginalAdminUser ? '' : effectiveUser.fullName;
      const mattersRes = await fetchAllMatterSources(effectiveUser.fullName, queryName);
      setMatters(mattersRes);
      
      // Fetch enquiries for new user with extended date range and fresh data
      const { dateFrom, dateTo } = getDateRange();
      // Use actual user's email and initials - no overrides
      const userInitials = effectiveUser.initials;
      const enquiriesEmail = effectiveUser.email;
      const adminFetchAll = isDevOwner(normalized) && !activeOriginalAdminUser;
      
      // Don't pass AOW to backend - let frontend handle AOW filtering for Claimable state only
      // For Mine/Claimed, users should see ALL their claimed enquiries regardless of DB AOW setting
      // Backend filtering by AOW would hide enquiries user has already claimed in other areas
      const enquiriesRes = await fetchEnquiries(
        enquiriesEmail,
        dateFrom,
        dateTo,
        "", // Empty AOW - frontend will apply AOW logic for Claimable state only
        userInitials,
        adminFetchAll,
        false  // bypassCache - allow caching for better performance when switching users
      );
      setEnquiries(enquiriesRes);
      

      
    } catch (err) {
      console.error('Error fetching data for switched user:', err);
      actionLog.warn('User switch failed');
    } finally {
      actionLog.end('User switch');
      setLoading(false);
    }
  };

  // Return to original admin user
  const returnToAdmin = async () => {
    if (originalAdminUser) {

      await switchUser(originalAdminUser);
      setOriginalAdminUser(null); // Clear the stored admin user
    }
  };

  // Handle user selection from dialog (outside Teams)
  const handleUserSelected = async (userKey: string) => {
    setShowEntryGate(false);
    setLoading(true);

    try {
      // Fetch team data from API to get user details
      const teamUserData = await fetchTeamData();
      if (!teamUserData || teamUserData.length === 0) {
        throw new Error('Failed to fetch team data from API');
      }

      // Find the selected user's data by initials (case insensitive)
      const selectedUserData = teamUserData.find((user: any) =>
        String(user.Initials || '').toLowerCase() === String(userKey || '').toLowerCase()
      ) || teamUserData.find((user: any) => user.status === 'active') || teamUserData[0];

      const gateSnapshotId = String(selectedUserData?.Email || userKey || 'local').trim().toLowerCase() || 'local';

      setTeamsContext({
        user: {
          id: gateSnapshotId,
          userPrincipalName: selectedUserData?.Email || 'lz@helix-law.com',
        },
        app: {
          theme: "default",
        },
      } as app.Context);

      const seededUser = normalizeUserRecord({
        ...selectedUserData,
        AOW: selectedUserData?.AOW || localSelectedAreas.join(', '),
      } as UserData) as UserData;
      const hydratedUser = await hydrateUserProfile(seededUser).catch(() => seededUser);
      const initialUserData = [(hydratedUser || seededUser) as UserData];

      writeRequestAuthContext(initialUserData[0]);
      setUserData(initialUserData as UserData[]);

      const gateSnapshot = readShellBootSnapshot(gateSnapshotId);
      let restoredGateSnapshot = false;
      let restoredGateCache = false;
      if (gateSnapshot) {
        if (gateSnapshot.enquiries?.length) setEnquiries(gateSnapshot.enquiries);
        if (gateSnapshot.teamData) setTeamData(gateSnapshot.teamData);
        setEnquiriesUsingSnapshot(Boolean(gateSnapshot.enquiries?.length));
        restoredGateSnapshot = true;
        console.info('[Boot:Gate] Shell snapshot restored — stale-first paint');
        trackBootStage('gate', 'snapshot', 'restored', {
          entry: 'passcode',
          hasEnquiries: Boolean(gateSnapshot.enquiries?.length),
          hasTeamData: Boolean(gateSnapshot.teamData),
        });
      } else {
          const cachedEffectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, teamUserData);
        const cachedEnquiries = getCachedEnquiriesSnapshot(
          cachedEffectiveUser.email,
          getDateRange().dateFrom,
          getDateRange().dateTo,
          initialUserData[0].AOW || '',
          cachedEffectiveUser.initials,
          isDevOwner(initialUserData[0] as UserData),
        );

        if (cachedEnquiries?.length) {
          setEnquiries(cachedEnquiries);
          setEnquiriesUsingSnapshot(true);
          restoredGateCache = true;
          console.info(`[Boot:Gate] Enquiries cache restored — stale-first paint (${cachedEnquiries.length} rows)`);
          trackBootStage('gate', 'enquiries-cache', 'restored', {
            entry: 'passcode',
            enquiriesCount: cachedEnquiries.length,
          });
        }
      }

      setTeamData(teamUserData);
      setLoading(false);

      // For local development, also test the dual enquiries fetching
      const { dateFrom, dateTo } = getDateRange();
      const effectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, teamUserData);

      const gateBoot = performance.now();
      const userInitials = effectiveUser.initials;
      const enquiriesEmail = effectiveUser.email;
      const deferLiveEnquiriesRefresh = restoredGateSnapshot || restoredGateCache;
      try {
        console.info('[Boot:Gate] Starting core data fetch');
        actionLog.start('Boot: core data');
        trackBootStage('gate', 'core-home', 'started', {
          entry: 'passcode',
          restoredSnapshot: restoredGateSnapshot,
          restoredCache: restoredGateCache,
        });
        setEnquiriesLiveRefreshInFlight(true);

          const enquiriesRes = await fetchEnquiries(enquiriesEmail, dateFrom, dateTo, initialUserData[0].AOW || "", userInitials, isDevOwner(initialUserData[0] as UserData), false)
          .catch(err => {
            console.warn('⚠️ Enquiries API failed, using fallback:', err);
            return import('./tabs/home/liveLocalEnquiries').then(m => m.getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[]);
          });

        setEnquiries(enquiriesRes);
        if (!deferLiveEnquiriesRefresh) {
          setLastEnquiriesLiveSyncAt(Date.now());
          setEnquiriesUsingSnapshot(false);
        }
        const coreHomeMs = Math.round(performance.now() - gateBoot);
        console.info(`[Boot:Gate] Core Home data ready in ${coreHomeMs}ms`);
        actionLog.end('Boot: core data', `${Array.isArray(enquiriesRes) ? enquiriesRes.length : 0} enquiries`);
        trackBootStage('gate', 'core-home', 'completed', {
          entry: 'passcode',
          enquiriesCount: Array.isArray(enquiriesRes) ? enquiriesRes.length : 0,
          restoredSnapshot: restoredGateSnapshot,
          restoredCache: restoredGateCache,
          deliveryMode: deferLiveEnquiriesRefresh ? 'cached-first' : 'direct',
        }, {
          duration: coreHomeMs,
        });
        trackBootSummary('gate', {
          entry: 'passcode',
          coreHomeMs,
          enquiriesCount: Array.isArray(enquiriesRes) ? enquiriesRes.length : 0,
          restoredSnapshot: restoredGateSnapshot,
          restoredCache: restoredGateCache,
          liveRefreshDeferred: deferLiveEnquiriesRefresh,
        }, {
          duration: coreHomeMs,
        });
      } catch (err) {
        console.error('❌ Unexpected error in entry gate:', err);
        trackBootStage('gate', 'core-home', 'failed', {
          entry: 'passcode',
          restoredSnapshot: restoredGateSnapshot,
          restoredCache: restoredGateCache,
        }, {
          duration: Math.round(performance.now() - gateBoot),
          error: err instanceof Error ? err.message : String(err),
        });
        const { getLiveLocalEnquiries } = await import('./tabs/home/liveLocalEnquiries');
        setEnquiries(getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[]);
        setEnquiriesUsingSnapshot(false);
      } finally {
        setEnquiriesLiveRefreshInFlight(false);
        if (deferLiveEnquiriesRefresh) {
          scheduleBootEnquiriesLiveRefresh({
            stage: 'gate',
            entry: 'passcode',
            email: enquiriesEmail,
            initials: userInitials,
            userAow: initialUserData[0].AOW || '',
            fetchAll: isDevOwner(initialUserData[0] as UserData),
            dateFrom,
            dateTo,
            restoredSnapshot: restoredGateSnapshot,
            restoredCache: restoredGateCache,
          });
        }
      }
    } catch (error) {
      console.error('❌ Error setting up user:', error);
      setError('Failed to initialize user data');
      setLoading(false);
    }
  };

  // ── Write shell boot snapshot whenever core data is populated ───────────
  // Keeps the snapshot fresh so next boot gets stale-first paint.
  useEffect(() => {
    if (!userData?.[0] || !enquiries?.length) return;
    const objectId = teamsContext?.user?.id || 'local';
    writeShellBootSnapshot({
      objectId,
      userData: userData,
      enquiries,
      teamData,
      savedAt: Date.now(),
    });
  }, [userData, enquiries, teamData, teamsContext]);

  useEffect(() => {
    const initializeTeamsAndFetchData = async () => {
      if (inTeams && !useLocalData) {
        try {
          // Use Teams SDK v2 Promise-based API with timeout protection
          const initPromise = app.initialize();
          const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SDK initialization timed out')), 10000)
          );
          
          await Promise.race([initPromise, timeout]);
          
          const ctx = await app.getContext();
          setTeamsContext(ctx);

          const objectId = ctx.user?.id || "";
          setEnquiriesUsingSnapshot(false);

          const teamsApiReadyStart = performance.now();
          trackBootStage('teams', 'api-ready', 'started', { entry: 'teams' });
          const teamsApiReady = await waitForLocalApiReady();
          if (!teamsApiReady) {
            trackBootStage('teams', 'api-ready', 'failed', { entry: 'teams' }, {
              duration: Math.round(performance.now() - teamsApiReadyStart),
              error: 'local-api-readiness-timeout',
            });
            setError('Local API did not start in time. Please wait a moment and refresh.');
            setLoading(false);
            return;
          }
          trackBootStage('teams', 'api-ready', 'completed', { entry: 'teams' }, {
            duration: Math.round(performance.now() - teamsApiReadyStart),
          });

          // ── Snapshot-first paint ─────────────────────────────────────
          // Restore cached boot data so components mount with data instead
          // of empty arrays.  Live fetches below will overwrite silently.
          const shellSnapshot = readShellBootSnapshot(objectId);
          const restoredShellSnapshot = Boolean(shellSnapshot);
          if (shellSnapshot) {
            if (shellSnapshot.userData?.length) setUserData(shellSnapshot.userData);
            if (shellSnapshot.enquiries?.length) setEnquiries(shellSnapshot.enquiries);
            if (shellSnapshot.teamData) setTeamData(shellSnapshot.teamData);
            setEnquiriesUsingSnapshot(Boolean(shellSnapshot.enquiries?.length));
            console.info('[Boot:Teams] Shell snapshot restored — stale-first paint');
            trackBootStage('teams', 'snapshot', 'restored', {
              entry: 'teams',
              hasUserData: Boolean(shellSnapshot.userData?.length),
              hasEnquiries: Boolean(shellSnapshot.enquiries?.length),
              hasTeamData: Boolean(shellSnapshot.teamData),
            });
          }

          setLoading(false);
          if (!objectId) {
            setError("Missing Teams context objectId.");
            return;
          }

          const { dateFrom, dateTo } = getDateRange();

          const primeUserDependentData = (profile: UserData[]) => {
            const primaryUser = profile?.[0];
            if (!primaryUser) {
              return;
            }
            const primeStart = performance.now();
            console.info('[Boot:Teams] Priming user-dependent data (parallel)');
            actionLog.start('Boot: priming data');
            trackBootStage('teams', 'prime-user-dependent', 'started', {
              entry: 'teams',
              restoredSnapshot: restoredShellSnapshot,
              devOwner: isDevOwner(primaryUser),
            });

            const fullName =
              `${primaryUser?.First ?? ''} ${primaryUser?.Last ?? ''}`.trim();

            // Use actual user's email and initials - no overrides
            const userInitials = primaryUser.Initials || "";
            const enquiriesEmail = primaryUser.Email || "";
            const deferLiveEnquiriesRefresh = restoredShellSnapshot;

            // ── Round 3: parallel matters fetch for dev-owners ──
            // Previously the dev-owner matters fetch was chained off enquiries.finally()
            // and wrapped in requestIdleCallback({timeout: 2500}), pushing hydrate.matters
            // to ~4.1s. The original justification ("matters is heavy") no longer applies —
            // /api/matters-new-space returns 125 rows in ~350ms (62KB). Firing in parallel
            // brings hydrate.matters down to ~max(enquiries, matters) instead of sum + slack.
            if (isDevOwner(primaryUser)) {
              const t0Matters = performance.now();
              actionLog.start('Boot: matters (parallel)');
              trackBootStage('teams', 'matters', 'started', {
                entry: 'teams',
                devOwner: true,
                reason: 'parallel-with-enquiries',
              });
              fetchAllMatterSources(fullName, '')
                .then(normalized => {
                  const mattersMs = Math.round(performance.now() - t0Matters);
                  console.info(`[Boot:Teams:DevOwner] Matters: ${normalized.length} rows in ${mattersMs}ms`);
                  setMatters(normalized);
                  actionLog.end('Boot: matters (parallel)', `${normalized.length} rows`);
                  trackBootStage('teams', 'matters', 'completed', {
                    entry: 'teams',
                    devOwner: true,
                    mattersCount: normalized.length,
                    reason: 'parallel-with-enquiries',
                  }, {
                    duration: mattersMs,
                  });
                })
                .catch(err => {
                  const mattersMs = Math.round(performance.now() - t0Matters);
                  console.warn('[Boot:Teams:DevOwner] Matters fetch failed:', err);
                  trackBootStage('teams', 'matters', 'failed', {
                    entry: 'teams',
                    devOwner: true,
                    reason: 'parallel-with-enquiries',
                  }, {
                    duration: mattersMs,
                    error: err instanceof Error ? err.message : String(err),
                  });
                });
            }

            const t0Enq = performance.now();
            setEnquiriesLiveRefreshInFlight(true);
            actionLog.start('Boot: enquiries');
            trackBootStage('teams', 'enquiries', 'started', {
              entry: 'teams',
              restoredSnapshot: restoredShellSnapshot,
              fetchAll: isDevOwner(primaryUser),
            });
            fetchEnquiries(
              enquiriesEmail,
              dateFrom,
              dateTo,
              "", // Empty AOW - frontend will apply AOW logic for Claimable state only
              userInitials,
              isDevOwner(primaryUser),
              false,
            ).then(res => {
              const enquiriesMs = Math.round(performance.now() - t0Enq);
              console.info(`[Boot:Teams] Enquiries: ${enquiriesMs}ms (${res.length} rows)`);
              actionLog.end('Boot: enquiries', `${res.length} rows`);
              setEnquiries(res);
              if (!deferLiveEnquiriesRefresh) {
                setLastEnquiriesLiveSyncAt(Date.now());
                setEnquiriesUsingSnapshot(false);
              }
              trackBootStage('teams', 'enquiries', 'completed', {
                entry: 'teams',
                restoredSnapshot: restoredShellSnapshot,
                fetchAll: isDevOwner(primaryUser),
                enquiriesCount: res.length,
                deliveryMode: deferLiveEnquiriesRefresh ? 'cached-first' : 'direct',
              }, {
                duration: enquiriesMs,
              });
              trackBootSummary('teams', {
                entry: 'teams',
                restoredSnapshot: restoredShellSnapshot,
                devOwner: isDevOwner(primaryUser),
                coreHomeMs: Math.round(performance.now() - primeStart),
                enquiriesMs,
                enquiriesCount: res.length,
                liveRefreshDeferred: deferLiveEnquiriesRefresh,
              }, {
                duration: Math.round(performance.now() - primeStart),
              });
            }).catch(err => {
              const enquiriesMs = Math.round(performance.now() - t0Enq);
              console.warn(`[Boot:Teams] Enquiries failed (${enquiriesMs}ms):`, err);
              trackBootStage('teams', 'enquiries', 'failed', {
                entry: 'teams',
                restoredSnapshot: restoredShellSnapshot,
                fetchAll: isDevOwner(primaryUser),
              }, {
                duration: enquiriesMs,
                error: err instanceof Error ? err.message : String(err),
              });
            }).finally(() => {
              setEnquiriesLiveRefreshInFlight(false);
              if (deferLiveEnquiriesRefresh) {
                scheduleBootEnquiriesLiveRefresh({
                  stage: 'teams',
                  entry: 'teams',
                  email: enquiriesEmail,
                  initials: userInitials,
                  userAow: '',
                  fetchAll: isDevOwner(primaryUser),
                  dateFrom,
                  dateTo,
                  restoredSnapshot: restoredShellSnapshot,
                });
              }
              if (isDevOwner(primaryUser)) {
                // Matters is now fetched in parallel with enquiries (see top of primeUserDependentData).
                // No deferred fetch needed here.
              }
            });
          };

          // Fire team-data alongside user-data — it's a global dataset with no user dependency.
          // This saves ~400ms by overlapping with user-data instead of waiting for it.
          const t0Team = performance.now();
          actionLog.start('Boot: team data');
          trackBootStage('teams', 'team-data', 'started', { entry: 'teams' });
          fetchTeamData()
            .then(res => {
              const teamMs = Math.round(performance.now() - t0Team);
              console.info(`[Boot:Teams] TeamData: ${teamMs}ms`);
              actionLog.end('Boot: team data');
              setTeamData(res);
              trackBootStage('teams', 'team-data', 'completed', {
                entry: 'teams',
                teamCount: Array.isArray(res) ? res.length : 0,
              }, {
                duration: teamMs,
              });
            })
            .catch(err => {
              const teamMs = Math.round(performance.now() - t0Team);
              console.warn(`[Boot:Teams] TeamData failed (${teamMs}ms):`, err);
              actionLog.warn('Boot: team data failed');
              trackBootStage('teams', 'team-data', 'failed', {
                entry: 'teams',
              }, {
                duration: teamMs,
                error: err instanceof Error ? err.message : String(err),
              });
              if (!restoredShellSnapshot) {
                setTeamData(null);
              }
            });

          trackBootStage('teams', 'user-data', 'started', { entry: 'teams' });
          fetchUserData(objectId)
            .then((userDataRes) => {
              setUserData(userDataRes);
              trackBootStage('teams', 'user-data', 'completed', {
                entry: 'teams',
                userCount: Array.isArray(userDataRes) ? userDataRes.length : 0,
              });
              if (!Array.isArray(userDataRes) || userDataRes.length === 0) {
                console.warn('User data fetch returned no records for objectId:', objectId);
                setError(restoredShellSnapshot
                  ? 'Live profile refresh failed. Showing recent cached data while we retry.'
                  : 'We could not load your profile details. Some data may be unavailable.');
                if (!restoredShellSnapshot) {
                  setEnquiries([]);
                  setMatters([]);
                  setTeamData(null);
                }
                return;
              }
              primeUserDependentData(userDataRes);
            })
            .catch((userErr) => {
              console.error("Failed to load user data:", userErr);
              trackBootStage('teams', 'user-data', 'failed', {
                entry: 'teams',
              }, {
                error: userErr instanceof Error ? userErr.message : String(userErr),
              });
              setError(restoredShellSnapshot
                ? 'Live profile refresh failed. Showing recent cached data while we retry.'
                : 'Failed to load user profile. Please refresh.');
              if (!restoredShellSnapshot) {
                setUserData([]);
                setEnquiries([]);
                setMatters([]);
                setTeamData(null);
              }
            });
        } catch (err: any) {
          console.error("Error initializing Teams:", err);
          setError(err.message || "Failed to initialize Teams.");
          setLoading(false);
        }
      } else {
        // No Teams context found
        const isWebEntry = new URLSearchParams(window.location.search).has('web');
        if (isLocalDevEnv && !isWebEntry) {
          // Local development: skip prompts and use default local user
          try {
            await dedup(`local-init:${localSelectedAreas.join('|')}`, async () => {
              setTeamsContext({
                user: {
                  id: "local",
                  userPrincipalName: "lz@helix-law.com",
                },
                app: {
                  theme: "default",
                },
              } as app.Context);

              // Initialize local user data with selected areas
              const { default: localUserData } = await import('./localData/localUserData.json');
              const initialUserData = [{
                ...localUserData[0],
                AOW: localSelectedAreas.join(', ')
              }];
              setUserData(initialUserData as UserData[]);

              const apiReadyStart = performance.now();
              trackBootStage('local', 'api-ready', 'started', { entry: 'local-dev' });
              const apiReady = await waitForLocalApiReady();
              if (!apiReady) {
                trackBootStage('local', 'api-ready', 'failed', { entry: 'local-dev' }, {
                  duration: Math.round(performance.now() - apiReadyStart),
                  error: 'local-api-readiness-timeout',
                });
                setError('Local API did not start in time. Please wait a moment and refresh.');
                setLoading(false);
                return;
              }
              trackBootStage('local', 'api-ready', 'completed', { entry: 'local-dev' }, {
                duration: Math.round(performance.now() - apiReadyStart),
              });

              // ── Snapshot-first paint (local dev) ────────────────────────
              const localSnapshot = readShellBootSnapshot('local');
              if (localSnapshot) {
                if (localSnapshot.enquiries?.length) setEnquiries(localSnapshot.enquiries);
                if (localSnapshot.teamData) setTeamData(localSnapshot.teamData);
                setEnquiriesUsingSnapshot(Boolean(localSnapshot.enquiries?.length));
                setLoading(false);
                console.info('[Boot:Local] Shell snapshot restored — stale-first paint');
                trackBootStage('local', 'snapshot', 'restored', {
                  entry: 'local-dev',
                  hasEnquiries: Boolean(localSnapshot.enquiries?.length),
                  hasTeamData: Boolean(localSnapshot.teamData),
                });
              }
              if (!localSnapshot) {
                setLoading(false);
              }

              // Resolve the effective local dataset identity first so boot doesn't
              // fetch the main enquiries dataset as raw LZ and then correct later.
              // Keep boot enquiry-first: matters hydrate only when the user visits Matters.
              const { dateFrom, dateTo } = getDateRange();
              const bootStart = performance.now();
              console.info('[Boot] Starting core data fetch');
              actionLog.start('Boot: core data');
              trackBootStage('local', 'core-home', 'started', {
                entry: 'local-dev',
                restoredSnapshot: Boolean(localSnapshot),
              });

              try {
                const cachedTeam = localSnapshot?.teamData || getCachedData<TeamData[]>('teamData');
                if (!localSnapshot && cachedTeam?.length) {
                  setTeamData(cachedTeam);
                }

                const cachedEffectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, cachedTeam || null);
                const cachedUserInitials = cachedEffectiveUser.initials || "";
                const cachedEnquiriesEmail = cachedEffectiveUser.email || "";

                if (!localSnapshot) {
                  const devOwnerBoot = isDevOwner(initialUserData[0] as UserData);
                  const cachedEnquiries = getCachedEnquiriesSnapshot(
                    cachedEnquiriesEmail,
                    dateFrom,
                    dateTo,
                    "",
                    cachedUserInitials,
                    devOwnerBoot,
                  );

                  if (cachedEnquiries?.length) {
                    setEnquiries(cachedEnquiries);
                    setEnquiriesUsingSnapshot(true);
                    console.info(`[Boot:Local] Enquiries cache restored — stale-first paint (${cachedEnquiries.length} rows)`);
                    trackBootStage('local', 'enquiries-cache', 'restored', {
                      entry: 'local-dev',
                      enquiriesCount: cachedEnquiries.length,
                    });
                  }
                }

                const t0Team = performance.now();
                actionLog.start('Boot: team data');
                trackBootStage('local', 'team-data', 'started', { entry: 'local-dev' });
                const liveTeamPromise = fetchTeamData()
                  .then((liveTeam) => {
                    const teamMs = Math.round(performance.now() - t0Team);
                    console.info(`[Boot] TeamData: ${teamMs}ms`);
                    actionLog.end('Boot: team data');
                    setTeamData(liveTeam);
                    trackBootStage('local', 'team-data', 'completed', {
                      entry: 'local-dev',
                      teamCount: Array.isArray(liveTeam) ? liveTeam.length : 0,
                    }, {
                      duration: teamMs,
                    });
                    return liveTeam;
                  })
                  .catch((err) => {
                    const teamMs = Math.round(performance.now() - t0Team);
                    console.warn(`[Boot] TeamData failed (${teamMs}ms):`, err);
                    trackBootStage('local', 'team-data', 'failed', {
                      entry: 'local-dev',
                    }, {
                      duration: teamMs,
                      error: err instanceof Error ? err.message : String(err),
                    });
                    return cachedTeam || null;
                  });

                setEnquiriesLiveRefreshInFlight(true);

                const refreshLocalEnquiries = async (teamForIdentity: TeamData[] | null) => {
                  const effectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, teamForIdentity);
                  const userInitials = effectiveUser.initials || "";
                  const enquiriesEmail = effectiveUser.email || "";
                  const fetchAll = isDevOwner(initialUserData[0] as UserData);
                  console.info(`[Boot] Enquiries fetch: email=${enquiriesEmail} initials=${userInitials} fetchAll=${fetchAll}`);
                  const t0 = performance.now();
                  trackBootStage('local', 'enquiries', 'started', {
                    entry: 'local-dev',
                    fetchAll,
                  });

                  try {
                    const res = await fetchEnquiries(
                      enquiriesEmail,
                      dateFrom,
                      dateTo,
                      "",
                      userInitials,
                      fetchAll,
                      true,
                    );
                    const enquiriesMs = Math.round(performance.now() - t0);
                    console.info(`[Boot] Enquiries: ${enquiriesMs}ms (${res.length} rows)`);
                    actionLog.end('Boot: enquiries', `${res.length} rows`);
                    setEnquiries(res);
                    setLastEnquiriesLiveSyncAt(Date.now());
                    setEnquiriesUsingSnapshot(false);
                    const coreHomeMs = Math.round(performance.now() - bootStart);
                    console.info(`[Boot] Core Home data ready in ${coreHomeMs}ms`);
                    actionLog.end('Boot: core data', `${res.length} enquiries`);
                    trackBootStage('local', 'enquiries', 'completed', {
                      entry: 'local-dev',
                      fetchAll,
                      enquiriesCount: res.length,
                    }, {
                      duration: enquiriesMs,
                    });
                    trackBootStage('local', 'core-home', 'completed', {
                      entry: 'local-dev',
                      fetchAll,
                      enquiriesCount: res.length,
                    }, {
                      duration: coreHomeMs,
                    });
                    trackBootSummary('local', {
                      entry: 'local-dev',
                      fetchAll,
                      enquiriesCount: res.length,
                      coreHomeMs,
                      enquiriesMs,
                      restoredSnapshot: Boolean(localSnapshot),
                    }, {
                      duration: coreHomeMs,
                    });
                    return { email: enquiriesEmail, initials: userInitials };
                  } catch (err) {
                    const enquiriesMs = Math.round(performance.now() - t0);
                    console.warn(`[Boot] Enquiries failed (${enquiriesMs}ms):`, err);
                    trackBootStage('local', 'enquiries', 'failed', {
                      entry: 'local-dev',
                      fetchAll,
                    }, {
                      duration: enquiriesMs,
                      error: err instanceof Error ? err.message : String(err),
                    });
                    trackBootStage('local', 'core-home', 'failed', {
                      entry: 'local-dev',
                      fetchAll,
                    }, {
                      duration: Math.round(performance.now() - bootStart),
                      error: err instanceof Error ? err.message : String(err),
                    });
                    const { getLiveLocalEnquiries } = await import('./tabs/home/liveLocalEnquiries');
                    setEnquiries(getLiveLocalEnquiries(enquiriesEmail || initialUserData[0].Email) as Enquiry[]);
                    setEnquiriesUsingSnapshot(false);
                    return { email: enquiriesEmail, initials: userInitials };
                  }
                };

                const initialRefreshIdentity = await refreshLocalEnquiries(cachedTeam || null);
                const liveTeam = await liveTeamPromise;
                const liveEffectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, liveTeam);
                const liveIdentityChanged =
                  liveEffectiveUser.email !== initialRefreshIdentity.email
                  || liveEffectiveUser.initials !== initialRefreshIdentity.initials;

                if (liveIdentityChanged) {
                  await refreshLocalEnquiries(liveTeam);
                }

                setEnquiriesLiveRefreshInFlight(false);

                // Dev owner matters stay out of the critical boot path.
                if (isDevOwner(initialUserData[0] as UserData)) {
                  const effectiveUser = resolveEffectiveDatasetUser(initialUserData[0] as UserData, liveTeam);
                  trackBootStage('local', 'matters', 'skipped', {
                    entry: 'local-dev',
                    devOwner: true,
                    reason: 'deferred-from-core-home',
                  });

                  const runDeferredMattersFetch = () => {
                    trackBootStage('local', 'matters', 'started', {
                      entry: 'local-dev',
                      devOwner: true,
                      reason: 'deferred-from-core-home',
                    });
                    fetchAllMatterSources(effectiveUser.fullName, '')
                      .then(normalized => {
                        console.info(`[Boot:DevOwner] Matters: ${normalized.length} rows`);
                        setMatters(normalized);
                        trackBootStage('local', 'matters', 'completed', {
                          entry: 'local-dev',
                          devOwner: true,
                          mattersCount: normalized.length,
                          reason: 'deferred-from-core-home',
                        });
                      })
                      .catch(err => {
                        console.warn('[Boot:DevOwner] Matters fetch failed:', err);
                        trackBootStage('local', 'matters', 'failed', {
                          entry: 'local-dev',
                          devOwner: true,
                          reason: 'deferred-from-core-home',
                        }, {
                          error: err instanceof Error ? err.message : String(err),
                        });
                      });
                  };

                  if ('requestIdleCallback' in window) {
                    (window as typeof window & {
                      requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                    }).requestIdleCallback(() => runDeferredMattersFetch(), { timeout: 2500 });
                  } else {
                    (window as Window).setTimeout(runDeferredMattersFetch, 1800);
                  }
                }
              } catch (err) {
                console.error('❌ Unexpected error in local dev:', err);
                trackBootStage('local', 'core-home', 'failed', {
                  entry: 'local-dev',
                }, {
                  duration: Math.round(performance.now() - bootStart),
                  error: err instanceof Error ? err.message : String(err),
                });
                const { getLiveLocalEnquiries } = await import('./tabs/home/liveLocalEnquiries');
                setEnquiries(getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[]);
                setTeamData(null);
                setEnquiriesLiveRefreshInFlight(false);
              }
            });
          } catch (e) {
            console.error('❌ Local init failed:', e);
            setLoading(false);
          }
        } else {
          // Production (outside Teams): require passcode + user selection
          clearRequestAuthContext();
          setLoading(false);
          setShowEntryGate(true);
        }
        return;
      }
    };

    initializeTeamsAndFetchData();
  }, [localSelectedAreas]); // Add dependency so it re-runs when areas change

  return (
    <>
      <App
        teamsContext={teamsContext}
        userData={userData}
        enquiries={enquiries}
        enquiriesUsingSnapshot={enquiriesUsingSnapshot}
        enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
        enquiriesLastLiveSyncAt={lastEnquiriesLiveSyncAt}
        matters={matters}
        isLoading={loading}
        error={error}
        teamData={teamData}
        isLocalDev={useLocalData}
        onAreaChange={updateLocalUserData}
        onUserChange={switchUser}
        onReturnToAdmin={returnToAdmin}
        originalAdminUser={originalAdminUser}
        onRefreshEnquiries={refreshEnquiries}
        onRefreshMatters={refreshMatters}
        onOptimisticClaim={optimisticClaimEnquiry}
        subscribeToEnquiryStream={subscribeToEnquiryStream}
        subscribeToPipelineStream={subscribeToPipelineStream}
        sseConnectionState={sseConnectionState}
        lastPipelineEventAt={lastPipelineEventAt}
      />
      <EntryGate
        isOpen={showEntryGate}
        onUserSelected={(userKey) => {
          setShowEntryGate(false);
          handleUserSelected(userKey);
        }}
      />
      {WayfindingOverlay && (
        <Suspense fallback={null}>
          <WayfindingOverlay />
        </Suspense>
      )}
    </>
  );
};

const root = document.getElementById('root');
const appRoot = createRoot(root!);

// StrictMode double-mounts every component in dev, doubling all API calls, SSE connections,
// and poll timers. Disable in dev for a clean request waterfall. Production builds ignore
// StrictMode anyway (it's a dev-only diagnostic).
const Wrapper = process.env.NODE_ENV === 'production' ? React.StrictMode : React.Fragment;

if (window.location.pathname === '/data') {
  appRoot.render(
    <Wrapper>
      <ErrorBoundary>
        <ThemeProvider theme={customTheme}>
          <Suspense
            fallback={
              <Loading
                message="Loading data..."
                detailMessages={[
                  'Fetching reporting data…',
                  'Normalizing records…',
                  'Preparing analytics…',
                ]}
                isDarkMode={resolveSystemDarkMode()}
              />
            }
          >
            <Data />
          </Suspense>
        </ThemeProvider>
      </ErrorBoundary>
    </Wrapper>
  );
  dismissStaticLoader();
} else {
  appRoot.render(
    <Wrapper>
      <ErrorBoundary>
        <ThemeProvider theme={customTheme}>
          <AppWithContext />
        </ThemeProvider>
      </ErrorBoundary>
    </Wrapper>
  );
  dismissStaticLoader();
}
