import React, { useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./app/styles/index.css";
import App from "./app/App";
import { createTheme, ThemeProvider } from "@fluentui/react";
import { colours } from "./app/styles/colours";
import { app } from "@microsoft/teams-js";
import { isInTeams } from "./app/functionality/isInTeams";
import { Matter, UserData, Enquiry, TeamData, NormalizedMatter } from "./app/functionality/types";
import { mergeMattersFromSources } from "./utils/matterNormalization";
import { getCachedData, setCachedData, cleanupOldCache } from "./utils/storageHelpers";
import { debugLog } from "./utils/debug";

import "./utils/callLogger";
import { initializeIcons } from "@fluentui/react";
import Loading from "./app/styles/Loading";
import ErrorBoundary from "./components/ErrorBoundary";
import UserSelectionDialog from "./components/UserSelectionDialog";
import PasscodeDialog from "./components/PasscodeDialog";
const Data = lazy(() => import("./tabs/Data"));

// Initialize icons once.
// This must happen before first render, otherwise Fluent UI will warn that icons
// (e.g. "cancel", "lock", "briefcase") were used before registration.
if (typeof window !== 'undefined' && !(window as any).__iconsInitialized) {
  initializeIcons();
  (window as any).__iconsInitialized = true;
}

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

// Surface any unhandled promise rejections so they don't fail silently
if (typeof window !== "undefined") {
  if (!(window as any).__unhandledRejectionHandlerAdded) {
    (window as any).__unhandledRejectionHandlerAdded = true;

    const hasChunkReloadedKey = '__helix_chunk_reload_once__';
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
      try {
        if (sessionStorage.getItem(hasChunkReloadedKey) === 'true') {
          console.error('[ChunkLoadError] reload already attempted; staying put', { source });
          return;
        }
        sessionStorage.setItem(hasChunkReloadedKey, 'true');
      } catch {
        // If sessionStorage is unavailable, still attempt a reload once.
      }

      console.warn('[ChunkLoadError] forcing reload to recover', { source });
      // Hard reload is the most reliable way to pick up new chunk filenames.
      window.location.reload();
    };

    window.addEventListener("unhandledrejection", (event) => {
      if (isChunkLoadError(event.reason)) {
        reloadOnceForChunkError('unhandledrejection', event.reason);
        event.preventDefault();
        return;
      }

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
      }
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

// In-memory cache for large datasets that exceed localStorage quota
// This persists for the session but doesn't use localStorage
const inMemoryCache = new Map<string, { data: any; timestamp: number }>();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (align with server enquiries TTL)

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

// Helper function to calculate the date range (6 months)
const getDateRange = () => {
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
async function fetchUserData(objectId: string): Promise<UserData[]> {
  const cacheKey = `userData-${objectId}`;
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
      body: JSON.stringify({ userObjectId: objectId }),
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
  const cacheKey = `enquiries-${email}-${dateFrom}-${dateTo}-${userAow}`;
  
  if (!bypassCache && !forceNoCaching) {
    // Try in-memory cache first (for large datasets)
    const memCached = getMemoryCachedData<Enquiry[]>(cacheKey);
    if (memCached) {
      if (process.env.NODE_ENV === 'development') {
        debugLog('📦 Using cached enquiries from memory:', memCached.length);
      }
      return memCached;
    }
    
    // Try localStorage cache (for smaller datasets)
    const cached = getCachedData<Enquiry[]>(cacheKey);
    if (cached) {
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
    
    const primaryUrl = `/api/enquiries-unified?${params.toString()}`;
    const resp = await fetch(primaryUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (resp.ok) {
      const data = await resp.json();
      let raw: any[] = [];
      if (Array.isArray(data)) raw = data; else if (Array.isArray(data.enquiries)) raw = data.enquiries;

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
        ...enq
      })) as Enquiry[];
    }
  } catch {
    // non-blocking; fallback below
  }

  // Fetch LEGACY enquiries as a fallback ONLY if we don't already have results
  try {
    if (enquiries.length === 0) {

    // Use local Express server proxy when developing, otherwise call production proxy
    const legacyBaseUrl = isLocalDev
      ? 'http://localhost:8080'
      : 'https://helix-keys-proxy.azurewebsites.net/api';
    const legacyPath = process.env.REACT_APP_GET_ENQUIRIES_PATH;
    const legacyCode = process.env.REACT_APP_GET_ENQUIRIES_CODE;
    const legacyDataUrl = `${legacyBaseUrl}/${legacyPath}?code=${legacyCode}`;

    // The proxy expects POST with JSON body containing email, dateFrom, dateTo
    // Use 'anyone' to retrieve all enquiries and filter client-side
    const legacyResponse = await fetch(legacyDataUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'anyone',
        dateFrom,
        dateTo,
      }),
    });

  if (legacyResponse.ok) {
      const legacyData = await legacyResponse.json();

      let rawLegacyEnquiries: any[] = [];
      if (Array.isArray(legacyData)) {
        rawLegacyEnquiries = legacyData;
      } else if (Array.isArray(legacyData.enquiries)) {
        rawLegacyEnquiries = legacyData.enquiries;
      }

      // Filter legacy enquiries based on email matching (legacy system)
      const userEmail = email.toLowerCase();

      const filteredLegacyEnquiries = rawLegacyEnquiries.filter(enq => {
        const pocEmail = (enq.Point_of_Contact || enq.poc || '').toLowerCase();
        // Only keep legacy enquiries assigned to the current user or the team inbox
        const unclaimedEmails = ['team@helix-law.com'];
        const isUnclaimed = unclaimedEmails.includes(pocEmail);

        return pocEmail === userEmail || isUnclaimed;
      });

      // Convert legacy data to Enquiry format and append to existing enquiries
      const legacyEnquiries = filteredLegacyEnquiries.map(enq => ({
        ID: enq.ID || enq.id || String(Math.random()),
        Date_Created: enq.Date_Created || enq.date_created || enq.datetime,
        Touchpoint_Date: enq.Touchpoint_Date || enq.touchpoint_date || enq.datetime,
        Email: enq.Email || enq.email,
        Area_of_Work: enq.Area_of_Work || enq.area_of_work || enq.aow,
        Type_of_Work: enq.Type_of_Work || enq.type_of_work || enq.tow,
        Method_of_Contact: enq.Method_of_Contact || enq.method_of_contact || enq.moc,
        Point_of_Contact: enq.Point_of_Contact || enq.poc,
        First_Name: enq.First_Name || enq.first_name || enq.first,
        Last_Name: enq.Last_Name || enq.last_name || enq.last,
        Phone_Number: enq.Phone_Number || enq.phone_number || enq.phone,
        Company: enq.Company || enq.company,
        Value: enq.Value || enq.value,
        Rating: enq.Rating || enq.rating,
        // Add any other fields as needed
        ...enq
      })) as Enquiry[];

      // Use LEGACY enquiries as fallback (no NEW data loaded yet)
      enquiries = [...legacyEnquiries];

    } else {
      await legacyResponse.text().catch(() => undefined);
    }
    }
  } catch (error) {
    // Legacy enquiries error is non-blocking
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
  if (userAow) {
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

  // IMPORTANT: We previously pointed local dev legacy fetch to /api/getMatters which
  // is now reserved for the NEW (VNet) dataset (decoupled fetchMattersData function).
  // That caused the "legacy" path to return new data and starve the actual new dataset
  // (because both code paths hit the same route and we then filtered by source).
  // To restore a clean separation:
  //  - NEW dataset   -> /api/getMatters (GET/POST)  (decoupled VNet function proxy)
  //  - LEGACY dataset (user) -> call legacy Azure Function via helix-keys proxy even in local dev
  //  - LEGACY dataset (all)  -> /api/getAllMatters (already legacy)
  // This ensures local dev still sees legacy data while allowing VNet toggle to work.
  // Route legacy per-user matters via server proxy to avoid exposing function keys
  // Mounted under /api in the local Express server
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
  // NEW dataset lives behind /api/getMatters (decoupled function). We previously
  // used /api/matters which is a single-matter Clio lookup route and cannot serve
  // bulk lists, resulting in 0 "new" matters. Switching to /api/getMatters fixes that.
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
  async function fetchAllMatterSources(fullName: string): Promise<NormalizedMatter[]> {
    // v5 cache key: unified server endpoint
    // Use in-memory cache instead of localStorage (matters data is too large)
    const cacheKey = `normalizedMatters-v5-${fullName}`;
    const cached = getMemoryCachedData<NormalizedMatter[]>(cacheKey);
    if (cached) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.info(`Matters cache hit (${cached.length} items)`);
      }
      return cached;
    }

    const isLocalDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    // Local dev: /api/matters-unified can be cold-start slow because it performs full-table
    // reads across two databases under tighter SQL request timeouts. Use the proven two-call
    // path to keep startup snappy and avoid 504/abort loops.
    if (isLocalDev) {
      try {
        // `/api/getAllMatters` is deprecated (410), so use per-user legacy matters instead.
        const [legacyUserMatters, vnetUserMatters] = await Promise.all([
          fetchMatters(fullName),
          fetchVNetMatters(fullName),
        ]);

        const normalizedMatters = mergeMattersFromSources(
          legacyUserMatters,
          [],
          vnetUserMatters,
          fullName,
        );

        setMemoryCachedData(cacheKey, normalizedMatters);
        return normalizedMatters;
      } catch {
        return [];
      }
    }

    try {
      const query = fullName ? `?fullName=${encodeURIComponent(fullName)}` : '';
      const url = `/api/matters-unified${query}`;
      const controller = new AbortController();
      const warnId = window.setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('[Matters] /api/matters-unified still pending…');
      }, 10_000);
      const timeoutId = window.setTimeout(() => controller.abort(), 45_000);

      // eslint-disable-next-line no-console
      console.info('[Matters] fetching unified…');

      const res = await fetch(url, { signal: controller.signal });
      window.clearTimeout(warnId);
      window.clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const legacyAll = Array.isArray(data.legacyAll) ? data.legacyAll : [];
      const vnetAll = Array.isArray(data.vnetAll) ? data.vnetAll : [];

      const normalizedMatters = mergeMattersFromSources(
        legacyAll,
        [],
        vnetAll,
        fullName,
      );
      
      // Cache in memory instead of localStorage (too large for localStorage)
      setMemoryCachedData(cacheKey, normalizedMatters);
      
      return normalizedMatters;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Matters] unified fetch failed', err);
      // Fallback: call previous two-source path
      try {
        const [allMatters, vnetAllMatters] = await Promise.all([
          fetchAllMatters(),
          fetchVNetMatters(),
        ]);
        const normalizedMatters = mergeMattersFromSources(
          allMatters,
          [],
          vnetAllMatters,
          fullName,
        );
        
        // Cache in memory instead of localStorage
        setMemoryCachedData(cacheKey, normalizedMatters);
        
        return normalizedMatters;
      } catch {
        return [];
      }
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
    // Use server route instead of decoupled function
    const response = await fetch(
      `/api/team-data`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch team data: ${response.statusText}`);
    }
    const data: TeamData[] = await response.json();
    
    // Single-pass counting (optimization: avoids double filtering)
    if (process.env.NODE_ENV === 'development') {
      let activeCount = 0;
      let inactiveCount = 0;
      for (const m of data) {
        const status = m.status?.toLowerCase();
        if (status === 'active') activeCount++;
        else if (status === 'inactive') inactiveCount++;
      }
  // eslint-disable-next-line no-console
  console.info('Team data:', data.length, 'members |', activeCount, 'active |', inactiveCount, 'inactive');
    }
    
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    console.error("❌ Error fetching team data:", error);
    return null;
  }
}

// Main component
const AppWithContext: React.FC = () => {
  const [teamsContext, setTeamsContext] =
    useState<app.Context | null>(null);
  const [userData, setUserData] = useState<UserData[] | null>(null);
  const [originalAdminUser, setOriginalAdminUser] = useState<UserData | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null);
  const [matters, setMatters] = useState<NormalizedMatter[]>([]);
  const [teamData, setTeamData] = useState<TeamData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserSelection, setShowUserSelection] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);

  // Avoid over-flushing server cache during rapid refresh bursts (e.g. SSE-driven refresh).
  const lastEnquiriesCacheFlushAtRef = React.useRef<number>(0);
  
  // Local development state for area selection
  const [localSelectedAreas, setLocalSelectedAreas] = useState<string[]>(['Commercial', 'Construction', 'Property']);

  // Refresh enquiries function - can be called after claiming an enquiry
  const refreshEnquiries = async () => {
    if (!userData || !userData[0]) return;
    
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
      const userEmail = userData[0].Email || "";
      // Don't apply AOW filtering when admin has switched users - show all enquiries like Management Dashboard
      const userAow = originalAdminUser ? "" : (userData[0].AOW || "");
      const userInitials = userData[0].Initials || "";

      const enquiriesRes = await fetchEnquiries(userEmail, dateFrom, dateTo, userAow, userInitials, false, true);
      setEnquiries(enquiriesRes);
      
    } catch (error) {
      console.error('❌ Error refreshing enquiries:', error);
    }
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

  // Refresh matters function - clears local caches and fetches normalized matters for current user
  const refreshMatters = async () => {
    if (!userData || !userData[0]) return;

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

      const fullName = (userData[0].FullName || `${userData[0].First || ''} ${userData[0].Last || ''}`.trim());
      const normalized = await fetchAllMatterSources(fullName);
      setMatters(normalized);
    } catch (err) {
      console.error('❌ Error refreshing matters:', err);
    }
  };

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

  // Allow switching user in production for specific users
  const switchUser = async (newUser: UserData) => {
    // Store the current admin user if this is the first switch
    if (!originalAdminUser && userData && userData[0]) {
      setOriginalAdminUser(userData[0]);
    }

    const normalized: UserData = {
      ...newUser,
      EntraID: (newUser as any)["Entra ID"] || newUser.EntraID,
      ClioID: (newUser as any)["Clio ID"] || newUser.ClioID,
      FullName: newUser.FullName || (newUser as any)["Full Name"],
    };
    setUserData([normalized]);
    const fullName =
      normalized.FullName ||
      `${normalized.First || ''} ${normalized.Last || ''}`.trim();
    


    
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
      // Only fetch matters if they're not already loaded (matters change less frequently)
      if (!matters || matters.length === 0) {
        // Fetch matters for new user
        const mattersRes = await fetchAllMatterSources(fullName);
        setMatters(mattersRes);
      }
      
      // Fetch enquiries for new user with extended date range and fresh data
      const { dateFrom, dateTo } = getDateRange();
      // Use actual user's email and initials - no overrides
      const userInitials = normalized.Initials || "";
      const enquiriesEmail = normalized.Email || "";
      
      // Don't pass AOW to backend - let frontend handle AOW filtering for Claimable state only
      // For Mine/Claimed, users should see ALL their claimed enquiries regardless of DB AOW setting
      // Backend filtering by AOW would hide enquiries user has already claimed in other areas
      const enquiriesRes = await fetchEnquiries(
        enquiriesEmail,
        dateFrom,
        dateTo,
        "", // Empty AOW - frontend will apply AOW logic for Claimable state only
        userInitials,
        false, // fetchAll
        false  // bypassCache - allow caching for better performance when switching users
      );
      setEnquiries(enquiriesRes);
      

      
    } catch (err) {
      console.error('Error fetching data for switched user:', err);
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
    setShowUserSelection(false);
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

      setTeamsContext({
        user: {
          id: "local",
          userPrincipalName: selectedUserData?.Email || 'lz@helix-law.com',
        },
        app: {
          theme: "default",
        },
      } as app.Context);

      const initialUserData = [{
        ...selectedUserData,
        AOW: localSelectedAreas.join(', ')
      }];

      setUserData(initialUserData as UserData[]);

      // For local development, also test the dual enquiries fetching
      const { dateFrom, dateTo } = getDateRange();
      const fullName = `${initialUserData[0].First} ${initialUserData[0].Last}`.trim();

      try {
        // Try to fetch enquiries independently first
        let enquiriesRes: Enquiry[] = [];
        try {
          const userInitials = initialUserData[0].Initials || "";
          const enquiriesEmail = initialUserData[0].Email || "";

          enquiriesRes = await fetchEnquiries(
            enquiriesEmail,
            dateFrom,
            dateTo,
            initialUserData[0].AOW || "",
            userInitials,
          );

        } catch (enquiriesError) {
          console.warn('⚠️ Enquiries API failed, using fallback:', enquiriesError);
          const { getLiveLocalEnquiries } = await import('./tabs/home/Home');
          enquiriesRes = getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[];
        }

        // Try to fetch matters separately (don't block enquiries)
        let normalizedMatters: NormalizedMatter[] = [];
        try {
          normalizedMatters = await fetchAllMatterSources(fullName);

        } catch (mattersError) {
          console.warn('⚠️ Matters API failed, using fallback:', mattersError);
          const { default: localMatters } = await import('./localData/localMatters.json');
          const fallbackMatters = mergeMattersFromSources([], localMatters as unknown as Matter[], [], fullName);
          normalizedMatters = fallbackMatters;
        }

        setEnquiries(enquiriesRes);
        setMatters(normalizedMatters);
      } catch (err) {
        console.error('❌ Unexpected error in local dev:', err);

        const { getLiveLocalEnquiries } = await import('./tabs/home/Home');
        const { default: localMatters } = await import('./localData/localMatters.json');
        const fallbackEnquiries = getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[];
        const fallbackMatters = mergeMattersFromSources([], localMatters as unknown as Matter[], [], fullName);

        setEnquiries(fallbackEnquiries);
        setMatters(fallbackMatters);
      }

      // Team data already fetched at start of handleUserSelected
      // Set it for downstream use
      const liveTeam = await fetchTeamData();
      setTeamData(liveTeam);

      setLoading(false);
    } catch (error) {
      console.error('❌ Error setting up user:', error);
      setError('Failed to initialize user data');
      setLoading(false);
    }
  };

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
          setLoading(false);

          const objectId = ctx.user?.id || "";
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

            const fullName =
              `${primaryUser?.First ?? ''} ${primaryUser?.Last ?? ''}`.trim();

            // Use actual user's email and initials - no overrides
            const userInitials = primaryUser.Initials || "";
            const enquiriesEmail = primaryUser.Email || "";

            fetchEnquiries(
              enquiriesEmail,
              dateFrom,
              dateTo,
              "", // Empty AOW - frontend will apply AOW logic for Claimable state only
              userInitials,
            ).then(setEnquiries).catch(err => {
              console.warn('Enquiries load failed, using empty array:', err);
              setEnquiries([]);
            });

            fetchAllMatterSources(fullName)
              .then(setMatters)
              .catch(err => {
                console.warn('Matters load failed, using empty array:', err);
                setMatters([]);
              });

            fetchTeamData()
              .then(setTeamData)
              .catch(err => {
                console.warn('Team data load failed, using null:', err);
                setTeamData(null);
              });
          };

          fetchUserData(objectId)
            .then((userDataRes) => {
              setUserData(userDataRes);
              if (!Array.isArray(userDataRes) || userDataRes.length === 0) {
                console.warn('User data fetch returned no records for objectId:', objectId);
                setError('We could not load your profile details. Some data may be unavailable.');
                setEnquiries([]);
                setMatters([]);
                setTeamData(null);
                return;
              }
              primeUserDependentData(userDataRes);
            })
            .catch((userErr) => {
              console.error("Failed to load user data:", userErr);
              setError("Failed to load user profile. Please refresh.");
              setUserData([]);
              setEnquiries([]);
              setMatters([]);
              setTeamData(null);
            });
        } catch (err: any) {
          console.error("Error initializing Teams:", err);
          setError(err.message || "Failed to initialize Teams.");
          setLoading(false);
        }
      } else {
        // No Teams context found
        if (isLocalDevEnv) {
          // Local development: skip prompts and use default local user
          try {
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

            // Fetch enquiries and matters
            const { dateFrom, dateTo } = getDateRange();
            const fullName = `${initialUserData[0].First} ${initialUserData[0].Last}`.trim();

            try {
              // Enquiries
              let enquiriesRes: Enquiry[] = [];
              try {
                const userInitials = initialUserData[0].Initials || "";
                const enquiriesEmail = initialUserData[0].Email || "";
                enquiriesRes = await fetchEnquiries(
                  enquiriesEmail,
                  dateFrom,
                  dateTo,
                  "", // Empty AOW - frontend will apply AOW logic for Claimable state only
                  userInitials,
                  false,  // fetchAll
                  true    // bypassCache - FORCE FRESH DATA on initial load to avoid stale cache
                );
              } catch (enquiriesError) {
                console.warn('⚠️ Enquiries API failed, using fallback:', enquiriesError);
                const { getLiveLocalEnquiries } = await import('./tabs/home/Home');
                enquiriesRes = getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[];
              }

              // Matters
              let normalizedMatters: NormalizedMatter[] = [];
              try {
                normalizedMatters = await fetchAllMatterSources(fullName);
              } catch (mattersError) {
                console.warn('⚠️ Matters API failed, using fallback:', mattersError);
                const { default: localMatters } = await import('./localData/localMatters.json');
                const fallbackMatters = mergeMattersFromSources([], localMatters as unknown as Matter[], [], fullName);
                normalizedMatters = fallbackMatters;
              }

              setEnquiries(enquiriesRes);
              setMatters(normalizedMatters);
            } catch (err) {
              console.error('❌ Unexpected error in local dev:', err);
              const { getLiveLocalEnquiries } = await import('./tabs/home/Home');
              const { default: localMatters } = await import('./localData/localMatters.json');
              const fallbackEnquiries = getLiveLocalEnquiries(initialUserData[0].Email) as Enquiry[];
              const fallbackMatters = mergeMattersFromSources([], localMatters as unknown as Matter[], [], fullName);
              setEnquiries(fallbackEnquiries);
              setMatters(fallbackMatters);
            }

            // Team data from API (no local fallback)
            const liveTeam = await fetchTeamData();
            setTeamData(liveTeam);

            setLoading(false);
          } catch (e) {
            console.error('❌ Local init failed:', e);
            setLoading(false);
          }
        } else {
          // Production (outside Teams): require passcode before selection
          setLoading(false);
          setShowPasscode(true);
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
      />
      <PasscodeDialog
        isOpen={showPasscode}
        onVerified={() => {
          setShowPasscode(false);
          setShowUserSelection(true);
        }}
      />
      <UserSelectionDialog
        isOpen={showUserSelection}
        onUserSelected={handleUserSelected}
      />
    </>
  );
};

const root = document.getElementById('root');
const appRoot = createRoot(root!);

if (window.location.pathname === '/data') {
  appRoot.render(
    <React.StrictMode>
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
    </React.StrictMode>
  );
  dismissStaticLoader();
} else {
  appRoot.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider theme={customTheme}>
          <AppWithContext />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  dismissStaticLoader();
}
