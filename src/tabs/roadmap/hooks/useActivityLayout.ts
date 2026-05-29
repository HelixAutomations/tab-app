// src/tabs/roadmap/hooks/useActivityLayout.ts — persisted layout state for the Activity tab
//
// Owns lens choice, layer visibility, tools-drawer state, and cross-lens drill-in selectors.
// Persists to localStorage (`helix:activity:layout:v1`) without mutating the URL.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityLens } from '../parts/ActivityHero';

const STORAGE_KEY = 'helix:activity:layout:v1';
const VALID_LENSES: ActivityLens[] = ['triage', 'all', 'forms', 'matters', 'sync', 'checks', 'errors', 'trace', 'signals', 'briefs', 'forge', 'actions', 'mechanisms', 'audit'];

export type LayerKey = 'presence' | 'sessions' | 'apiHeat' | 'scheduler' | 'alerts';
export type ToolsTab = 'releaseNotes' | 'apiHeat' | 'cardLab' | 'bootTrace';

const DEFAULT_LAYERS: LayerKey[] = ['presence', 'sessions', 'apiHeat'];
const VALID_LAYERS: LayerKey[] = ['presence', 'sessions', 'apiHeat', 'scheduler', 'alerts'];
const VALID_TOOLS_TABS: ToolsTab[] = ['releaseNotes', 'apiHeat', 'cardLab', 'bootTrace'];

export interface ActivityLayoutState {
  lens: ActivityLens;
  layers: LayerKey[];
  toolsOpen: boolean;
  toolsTab: ToolsTab;
  selectedSessionId: string | null;
  selectedErrorTs: number | null;
}

interface PersistedShape {
  lens?: string;
  layers?: string[];
  toolsOpen?: boolean;
  toolsTab?: string;
}

function isLens(value: unknown): value is ActivityLens {
  return typeof value === 'string' && (VALID_LENSES as string[]).includes(value);
}

function isLayer(value: unknown): value is LayerKey {
  return typeof value === 'string' && (VALID_LAYERS as string[]).includes(value);
}

function isToolsTab(value: unknown): value is ToolsTab {
  return typeof value === 'string' && (VALID_TOOLS_TABS as string[]).includes(value);
}

function readPersisted(): Partial<ActivityLayoutState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedShape;
    const out: Partial<ActivityLayoutState> = {};
    if (isLens(parsed.lens)) out.lens = parsed.lens;
    if (Array.isArray(parsed.layers)) {
      const layers = parsed.layers.filter(isLayer);
      if (layers.length > 0) out.layers = layers;
    }
    if (typeof parsed.toolsOpen === 'boolean') out.toolsOpen = parsed.toolsOpen;
    if (isToolsTab(parsed.toolsTab)) out.toolsTab = parsed.toolsTab;
    return out;
  } catch {
    return {};
  }
}

function clearLegacyQueryState(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const hadLegacyState = params.has('lens') || params.has('session') || params.has('errorTs');
    if (!hadLegacyState) return;
    params.delete('lens');
    params.delete('session');
    params.delete('errorTs');
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  } catch {
    // ignore, URL cleanup is best-effort
  }
}

export interface ActivityLayoutControls extends ActivityLayoutState {
  setLens: (next: ActivityLens) => void;
  toggleLayer: (key: LayerKey) => void;
  setLayers: (next: LayerKey[]) => void;
  setToolsOpen: (open: boolean) => void;
  setToolsTab: (tab: ToolsTab) => void;
  focusLens: (lens: ActivityLens, opts?: { sessionId?: string | null; errorTs?: number | null }) => void;
  clearSelections: () => void;
}

export function useActivityLayout(): ActivityLayoutControls {
  const persistedRef = useRef<Partial<ActivityLayoutState> | null>(null);
  if (persistedRef.current === null) persistedRef.current = readPersisted();

  const initialLens: ActivityLens = persistedRef.current.lens ?? 'triage';
  const initialLayers: LayerKey[] = persistedRef.current.layers ?? DEFAULT_LAYERS;
  const initialToolsOpen = persistedRef.current.toolsOpen ?? false;
  const initialToolsTab: ToolsTab = persistedRef.current.toolsTab ?? 'releaseNotes';

  const [lens, setLensState] = useState<ActivityLens>(initialLens);
  const [layers, setLayersState] = useState<LayerKey[]>(initialLayers);
  const [toolsOpen, setToolsOpenState] = useState<boolean>(initialToolsOpen);
  const [toolsTab, setToolsTabState] = useState<ToolsTab>(initialToolsTab);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedErrorTs, setSelectedErrorTs] = useState<number | null>(null);

  useEffect(() => {
    clearLegacyQueryState();
  }, []);

  // Persist non-selection state to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: PersistedShape = { lens, layers, toolsOpen, toolsTab };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // quota / private mode — ignore
    }
  }, [lens, layers, toolsOpen, toolsTab]);

  const setLens = useCallback((next: ActivityLens) => {
    setLensState(next);
    // switching lens clears unrelated selection so URL stays meaningful
    if (next !== 'trace') setSelectedSessionId(null);
    if (next !== 'errors') setSelectedErrorTs(null);
  }, []);

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayersState((prev) => (prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key]));
  }, []);

  const setLayers = useCallback((next: LayerKey[]) => {
    setLayersState(next.filter(isLayer));
  }, []);

  const setToolsOpen = useCallback((open: boolean) => setToolsOpenState(open), []);
  const setToolsTab = useCallback((tab: ToolsTab) => setToolsTabState(tab), []);

  const focusLens = useCallback(
    (next: ActivityLens, opts?: { sessionId?: string | null; errorTs?: number | null }) => {
      setLensState(next);
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'sessionId')) {
        setSelectedSessionId(opts.sessionId ?? null);
      } else if (next !== 'trace') {
        setSelectedSessionId(null);
      }
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'errorTs')) {
        setSelectedErrorTs(opts.errorTs ?? null);
      } else if (next !== 'errors') {
        setSelectedErrorTs(null);
      }
    },
    [],
  );

  const clearSelections = useCallback(() => {
    setSelectedSessionId(null);
    setSelectedErrorTs(null);
  }, []);

  return useMemo(
    () => ({
      lens,
      layers,
      toolsOpen,
      toolsTab,
      selectedSessionId,
      selectedErrorTs,
      setLens,
      toggleLayer,
      setLayers,
      setToolsOpen,
      setToolsTab,
      focusLens,
      clearSelections,
    }),
    [
      lens,
      layers,
      toolsOpen,
      toolsTab,
      selectedSessionId,
      selectedErrorTs,
      setLens,
      toggleLayer,
      setLayers,
      setToolsOpen,
      setToolsTab,
      focusLens,
      clearSelections,
    ],
  );
}
