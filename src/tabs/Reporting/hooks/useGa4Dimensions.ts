/**
 * useGa4Dimensions — fetches the cached GA4 dimension routes
 * (`/api/marketing-metrics/ga4/{channels|source-medium|landing-pages|devices|geo}`)
 * for the current report range, respecting the Organic-only toggle.
 *
 * The server already caches each route for 1800s, so refetching on range
 * changes is cheap. Each fetch is independent so a stalled dimension
 * does not block the rest of the report from rendering.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DateRange } from './useReportRange';

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  conversions: number;
}

export interface Ga4SourceMediumRow {
  sourceMedium: string;
  sessions: number;
  conversions: number;
}

export interface Ga4LandingPageRow {
  landingPage: string;
  sessions: number;
  conversions: number;
}

export interface Ga4DeviceRow {
  device: string;
  sessions: number;
  conversions: number;
}

export interface Ga4GeoRow {
  country: string;
  sessions: number;
  conversions: number;
}

export interface Ga4Dimensions {
  channels: Ga4ChannelRow[];
  sourceMedium: Ga4SourceMediumRow[];
  landingPages: Ga4LandingPageRow[];
  devices: Ga4DeviceRow[];
  geo: Ga4GeoRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface FetchOpts {
  startDate: string;
  endDate: string;
  organicOnly: boolean;
  signal: AbortSignal;
}

async function fetchJson<T>(path: string, key: string, opts: FetchOpts): Promise<T[]> {
  const params = new URLSearchParams({
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  if (opts.organicOnly) params.set('organicOnly', 'true');
  const res = await fetch(`${path}?${params.toString()}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`${key} ${res.status}`);
  const payload = await res.json();
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  return [];
}

interface UseGa4DimensionsOptions {
  range: DateRange | null;
  organicOnly: boolean;
  enabled?: boolean;
}

export function useGa4Dimensions({ range, organicOnly, enabled = true }: UseGa4DimensionsOptions): Ga4Dimensions {
  const [channels, setChannels] = useState<Ga4ChannelRow[]>([]);
  const [sourceMedium, setSourceMedium] = useState<Ga4SourceMediumRow[]>([]);
  const [landingPages, setLandingPages] = useState<Ga4LandingPageRow[]>([]);
  const [devices, setDevices] = useState<Ga4DeviceRow[]>([]);
  const [geo, setGeo] = useState<Ga4GeoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const key = useMemo(() => {
    if (!range) return null;
    return `${fmtDate(range.start)}_${fmtDate(range.end)}_${organicOnly ? 'organic' : 'all'}`;
  }, [range, organicOnly]);

  useEffect(() => {
    if (!enabled || !range || !key) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const opts: FetchOpts = {
      startDate: fmtDate(range.start),
      endDate: fmtDate(range.end),
      organicOnly,
      signal: controller.signal,
    };

    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchJson<Ga4ChannelRow>('/api/marketing-metrics/ga4/channels', 'channels', opts),
      fetchJson<Ga4SourceMediumRow>('/api/marketing-metrics/ga4/source-medium', 'sourceMedium', opts),
      fetchJson<Ga4LandingPageRow>('/api/marketing-metrics/ga4/landing-pages', 'landingPages', opts),
      fetchJson<Ga4DeviceRow>('/api/marketing-metrics/ga4/devices', 'devices', opts),
      fetchJson<Ga4GeoRow>('/api/marketing-metrics/ga4/geo', 'geo', opts),
    ])
      .then((results) => {
        if (controller.signal.aborted) return;
        const [chRes, smRes, lpRes, dvRes, geoRes] = results;
        if (chRes.status === 'fulfilled') setChannels(chRes.value); else setChannels([]);
        if (smRes.status === 'fulfilled') setSourceMedium(smRes.value); else setSourceMedium([]);
        if (lpRes.status === 'fulfilled') setLandingPages(lpRes.value); else setLandingPages([]);
        if (dvRes.status === 'fulfilled') setDevices(dvRes.value); else setDevices([]);
        if (geoRes.status === 'fulfilled') setGeo(geoRes.value); else setGeo([]);
        const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
        if (failed.length === results.length) {
          setError(failed[0]?.reason?.message || 'All GA4 dimension fetches failed');
        } else if (failed.length > 0) {
          setError(`${failed.length} of ${results.length} dimension fetches failed`);
        } else {
          setError(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // refreshTick is intentionally a dependency so refresh() forces re-run.
  }, [enabled, range, key, organicOnly, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  return { channels, sourceMedium, landingPages, devices, geo, loading, error, refresh };
}
