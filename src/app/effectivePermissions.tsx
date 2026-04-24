/**
 * Effective permissions: a thin rendering-layer override on top of the raw
 * tier helpers in `src/app/admin.ts`.
 *
 * Why this exists
 * ───────────────
 * Two distinct concepts already live in the codebase (see
 * `.github/copilot-instructions.md` §"User Tiers"):
 *
 *   1. Tier helpers (`isAdminUser`, `isDevOwner`, …) — pure functions of the
 *      real user. These remain the single source of truth for *what the real
 *      user is*.
 *
 *   2. The "View as" override (this module) — a context value that lets the
 *      dev owner pretend to be a different tier *for rendering only*, without
 *      changing what data is loaded or what the underlying helpers return.
 *
 * Stash brief: docs/notes/_archive/DEV_PREVIEW_AND_VIEW_AS.md (when archived).
 *
 * Phase B scope (this file)
 * ─────────────────────────
 * - `EffectivePermissionsProvider` holds `{ overrideTier, setOverrideTier }`.
 * - `useEffectivePermissions(currentUser)` returns the standard tier flags,
 *   either passthrough (override === null) or coerced to match the override.
 * - `FormsHub` is the pilot consumer; rollout to other tabs lands in Phase D.
 *
 * Phase C will wire the "View as" pill in `UserBubble` to call
 * `setOverrideTier`, gated on `isDevOwner(realUser) && demoModeEnabled`.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { UserData } from './functionality/types';
import {
  canAccessReports as rawCanAccessReports,
  isAdminUser as rawIsAdminUser,
  isDevOwner as rawIsDevOwner,
  isOperationsUser as rawIsOperationsUser,
} from './admin';

export type EffectiveTier = 'devOwner' | 'admin' | 'regular';

const STORAGE_KEY = 'helix-effective-permissions-override-v1';

interface EffectivePermissionsContextValue {
  overrideTier: EffectiveTier | null;
  setOverrideTier: (next: EffectiveTier | null) => void;
}

const EffectivePermissionsContext = createContext<EffectivePermissionsContextValue>({
  overrideTier: null,
  setOverrideTier: () => {
    // No-op default — the real implementation lives in the provider below.
    // Calling this without a provider is a no-op rather than an error so that
    // tab tests that render in isolation still behave naturally.
  },
});

export const EffectivePermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Persist in sessionStorage so the override clears on tab close — matches the
  // "rendering preview" intent (it's not meant to follow the user across
  // sessions or reboots).
  const [overrideTier, setOverrideTierState] = useState<EffectiveTier | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw === 'devOwner' || raw === 'admin' || raw === 'regular') {
        return raw;
      }
    } catch {
      // sessionStorage unavailable — default to passthrough.
    }
    return null;
  });

  const setOverrideTier = useCallback((next: EffectiveTier | null) => {
    setOverrideTierState(next);
    try {
      if (next) {
        sessionStorage.setItem(STORAGE_KEY, next);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Non-fatal: just keep in-memory state.
    }
  }, []);

  // Cross-tab coordination: if the override changes in another tab/window, mirror
  // it here so the rendering stays consistent. Only fires when sessionStorage
  // changes are visible (rare for sessionStorage, but harmless).
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const raw = event.newValue;
      if (raw === 'devOwner' || raw === 'admin' || raw === 'regular') {
        setOverrideTierState(raw);
      } else {
        setOverrideTierState(null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const value = useMemo(() => ({ overrideTier, setOverrideTier }), [overrideTier, setOverrideTier]);

  return (
    <EffectivePermissionsContext.Provider value={value}>
      {children}
    </EffectivePermissionsContext.Provider>
  );
};

/**
 * Read + write the current override tier. Phase C uses this from the UserBubble
 * "View as" pill; Phase D rollout uses it in tab roots that need to render the
 * pill or react to override changes outside `useEffectivePermissions` itself.
 */
export function useEffectivePermissionsContext(): EffectivePermissionsContextValue {
  return useContext(EffectivePermissionsContext);
}

export interface EffectivePermissions {
  /** True when the real user is LZ or AC (the dev preview group). */
  isLzOrAc: boolean;
  isAdminUser: boolean;
  canAccessReports: boolean;
  isDevOwner: boolean;
  isOperationsUser: boolean;
  /** Mirrors the active context override, or `null` when in passthrough mode. */
  overrideTier: EffectiveTier | null;
}

function computePassthrough(user?: UserData | null): Omit<EffectivePermissions, 'overrideTier'> {
  const initials = (user?.Initials || '').toUpperCase().trim();
  return {
    isLzOrAc: initials === 'LZ' || initials === 'AC',
    isAdminUser: rawIsAdminUser(user),
    canAccessReports: rawCanAccessReports(user),
    isDevOwner: rawIsDevOwner(user),
    isOperationsUser: rawIsOperationsUser(user),
  };
}

function applyOverride(tier: EffectiveTier): Omit<EffectivePermissions, 'overrideTier'> {
  switch (tier) {
    case 'devOwner':
      // Dev owner sees everything. Mirrors the real LZ flags.
      return {
        isLzOrAc: true,
        isAdminUser: true,
        canAccessReports: true,
        isDevOwner: true,
        isOperationsUser: true,
      };
    case 'admin':
      // Trusted internal admin (e.g. KW) — admin features visible, but no
      // dev-preview gates and no dev-owner data scope. Reports access on by
      // default; if a real admin is excluded (LA), the brief calls for the
      // override to err on the side of "show me what an admin sees", so we
      // leave Reports on. Out-of-scope: a future "as LA" sub-mode could turn
      // it off.
      return {
        isLzOrAc: false,
        isAdminUser: true,
        canAccessReports: true,
        isDevOwner: false,
        isOperationsUser: true,
      };
    case 'regular':
      // Fee earner / general user. All admin/dev gates closed.
      return {
        isLzOrAc: false,
        isAdminUser: false,
        canAccessReports: false,
        isDevOwner: false,
        isOperationsUser: false,
      };
  }
}

/**
 * Returns the effective permission flags for `currentUser`, applying the active
 * "View as" override when one is set. When no override is active this is a pure
 * passthrough to the raw tier helpers in `src/app/admin.ts`.
 */
export function useEffectivePermissions(currentUser?: UserData | null): EffectivePermissions {
  const { overrideTier } = useEffectivePermissionsContext();

  return useMemo<EffectivePermissions>(() => {
    const base = overrideTier ? applyOverride(overrideTier) : computePassthrough(currentUser);
    return { ...base, overrideTier };
  }, [currentUser, overrideTier]);
}
