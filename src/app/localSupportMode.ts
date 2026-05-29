export type LocalSupportMode = 'fast-shell' | 'enquiries' | 'matters' | 'reports' | 'system' | 'full-live';
export type LocalDataScope = 'none' | 'mine' | 'team';

export interface LocalSupportSettings {
  mode: LocalSupportMode;
  dataScope: LocalDataScope;
}

export interface LocalSupportModeOption {
  id: LocalSupportMode;
  label: string;
  hint: string;
  targetTab: 'home' | 'enquiries' | 'matters' | 'reporting' | 'roadmap';
}

export interface LocalDataScopeOption {
  id: LocalDataScope;
  label: string;
  hint: string;
}

export const LOCAL_SUPPORT_MODE_STORAGE_KEY = 'helix.localSupport.mode';
export const LOCAL_SUPPORT_DATA_SCOPE_STORAGE_KEY = 'helix.localSupport.dataScope';
export const LOCAL_SUPPORT_CHANGED_EVENT = 'helix:localSupportChanged';

export const LOCAL_SUPPORT_MODE_OPTIONS: LocalSupportModeOption[] = [
  {
    id: 'fast-shell',
    label: 'Fast shell',
    hint: 'Boot the UI shell and navigation without live Home data.',
    targetTab: 'home',
  },
  {
    id: 'enquiries',
    label: 'Enquiries / Pitch',
    hint: 'Land on Enquiries and keep Pitch Builder support work warm.',
    targetTab: 'enquiries',
  },
  {
    id: 'matters',
    label: 'Matters / CCL',
    hint: 'Land on Matters and avoid unrelated Enquiries or Reports warm-up.',
    targetTab: 'matters',
  },
  {
    id: 'reports',
    label: 'Reports',
    hint: 'Land on Reports without paying the Home team boot tax.',
    targetTab: 'reporting',
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Land on System Errors with live Hub telemetry and background pollers off.',
    targetTab: 'roadmap',
  },
  {
    id: 'full-live',
    label: 'Full live',
    hint: 'Current heavy local behaviour for scheduler, sync, and team-wide checks.',
    targetTab: 'home',
  },
];

export const LOCAL_DATA_SCOPE_OPTIONS: LocalDataScopeOption[] = [
  {
    id: 'none',
    label: 'No data',
    hint: 'Skip live local boot fetches where the surface can render without them.',
  },
  {
    id: 'mine',
    label: 'Mine live',
    hint: 'Fetch only the active user scope where supported.',
  },
  {
    id: 'team',
    label: 'Team live',
    hint: 'Allow team-wide and firm-wide datasets. Heaviest local mode.',
  },
];

export const DEFAULT_LOCAL_SUPPORT_SETTINGS: LocalSupportSettings = {
  mode: 'full-live',
  dataScope: 'team',
};

export function getLocalSupportModeOption(mode: LocalSupportMode): LocalSupportModeOption {
  return LOCAL_SUPPORT_MODE_OPTIONS.find((option) => option.id === mode) || LOCAL_SUPPORT_MODE_OPTIONS[0];
}

export function normalizeLocalSupportMode(value: unknown): LocalSupportMode | null {
  const raw = String(value || '').trim();
  return LOCAL_SUPPORT_MODE_OPTIONS.some((option) => option.id === raw)
    ? raw as LocalSupportMode
    : null;
}

export function normalizeLocalDataScope(value: unknown): LocalDataScope | null {
  const raw = String(value || '').trim();
  return LOCAL_DATA_SCOPE_OPTIONS.some((option) => option.id === raw)
    ? raw as LocalDataScope
    : null;
}

export function defaultDataScopeForMode(mode: LocalSupportMode): LocalDataScope {
  if (mode === 'fast-shell') return 'none';
  if (mode === 'full-live') return 'team';
  return 'mine';
}

export function readLocalSupportSettings(isLocalDev: boolean): LocalSupportSettings {
  if (!isLocalDev) return DEFAULT_LOCAL_SUPPORT_SETTINGS;

  const envMode = normalizeLocalSupportMode(process.env.REACT_APP_HELIX_SUPPORT_MODE);
  const envScope = normalizeLocalDataScope(process.env.REACT_APP_HELIX_DATA_SCOPE);
  let storedMode: LocalSupportMode | null = null;
  let storedScope: LocalDataScope | null = null;

  if (typeof window !== 'undefined') {
    try {
      storedMode = normalizeLocalSupportMode(window.localStorage.getItem(LOCAL_SUPPORT_MODE_STORAGE_KEY));
      storedScope = normalizeLocalDataScope(window.localStorage.getItem(LOCAL_SUPPORT_DATA_SCOPE_STORAGE_KEY));
    } catch {
      storedMode = null;
      storedScope = null;
    }
  }

  const mode = envMode || storedMode || DEFAULT_LOCAL_SUPPORT_SETTINGS.mode;
  const dataScope = envScope || storedScope || defaultDataScopeForMode(mode);
  return { mode, dataScope };
}

export function persistLocalSupportSettings(settings: LocalSupportSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SUPPORT_MODE_STORAGE_KEY, settings.mode);
    window.localStorage.setItem(LOCAL_SUPPORT_DATA_SCOPE_STORAGE_KEY, settings.dataScope);
  } catch {
    // Storage is best-effort in embedded hosts.
  }
}

export function dispatchLocalSupportChanged(settings: LocalSupportSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_SUPPORT_CHANGED_EVENT, { detail: settings }));
  } catch {
    // No-op for older hosts.
  }
}

export function shouldSkipLocalLiveData(settings: LocalSupportSettings): boolean {
  return settings.dataScope === 'none';
}

export function shouldAllowLocalTeamData(settings: LocalSupportSettings): boolean {
  return settings.dataScope === 'team';
}

export function shouldRunLocalShellEnquiries(settings: LocalSupportSettings): boolean {
  if (settings.dataScope === 'none') return false;
  return settings.mode === 'full-live' || settings.mode === 'enquiries';
}

export function shouldRunLocalShellMatters(settings: LocalSupportSettings): boolean {
  if (settings.dataScope === 'none') return false;
  return settings.mode === 'full-live' || settings.mode === 'matters';
}