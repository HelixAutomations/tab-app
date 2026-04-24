import React from 'react';
import { useToast } from '../components/feedback/ToastProvider';

/**
 * useCclPipelineToasts — single source of truth for CCL pipeline toasts.
 *
 * Keys toasts by matterId so a new phase for the same matter mutates the
 * existing toast instead of stacking a second one. Honours the most-recent
 * non-null `persist` value (loading phases persist; success/error auto-dismiss).
 *
 * Consumers:
 *   const { upsert, dismissAll } = useCclPipelineToasts();
 *   upsert({ matterId, phase: 'auto-fill', type: 'loading', title, message, persist: true });
 *   upsert({ matterId, phase: 'pressure-test', type: 'success', title, message });
 */

export type CclToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface UpsertCclToastOptions {
  matterId: string;
  phase: string;
  title: string;
  message: string;
  type?: CclToastType;
  persist?: boolean | null;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface CclPipelineToastsApi {
  upsert: (options: UpsertCclToastOptions) => string;
  dismiss: (matterId: string) => void;
  dismissAll: () => void;
}

export function useCclPipelineToasts(): CclPipelineToastsApi {
  const { showToast, updateToast, hideToast } = useToast();

  // matterId -> { toastId, persist }
  const toastsByMatterRef = React.useRef<Map<string, { toastId: string; persist: boolean }>>(new Map());

  const upsert = React.useCallback((options: UpsertCclToastOptions): string => {
    const {
      matterId,
      phase,
      title,
      message,
      type = 'loading',
      persist,
      duration,
      action,
    } = options;

    void phase; // reserved for future telemetry grouping

    const key = String(matterId || '').trim() || '__no-matter__';
    const existing = toastsByMatterRef.current.get(key);

    // Resolve effective persist: honour explicit non-null value; otherwise carry previous.
    const effectivePersist = persist === null || persist === undefined
      ? (existing?.persist ?? false)
      : Boolean(persist);

    // Terminal states (success/error) default to auto-dismiss unless caller persists explicitly.
    const terminal = type === 'success' || type === 'error';
    const effectiveDuration = duration ?? (terminal ? 6500 : undefined);

    if (existing) {
      updateToast(existing.toastId, {
        type,
        title,
        message,
        persist: effectivePersist,
        duration: effectiveDuration,
        action,
      });
      toastsByMatterRef.current.set(key, { toastId: existing.toastId, persist: effectivePersist });

      if (terminal && !effectivePersist) {
        const tId = existing.toastId;
        window.setTimeout(() => {
          const current = toastsByMatterRef.current.get(key);
          if (current?.toastId === tId) {
            toastsByMatterRef.current.delete(key);
          }
        }, effectiveDuration ?? 6500);
      }
      return existing.toastId;
    }

    const newId = showToast({
      type,
      title,
      message,
      persist: effectivePersist,
      duration: effectiveDuration,
      action,
    });
    toastsByMatterRef.current.set(key, { toastId: newId, persist: effectivePersist });

    if (terminal && !effectivePersist) {
      window.setTimeout(() => {
        const current = toastsByMatterRef.current.get(key);
        if (current?.toastId === newId) {
          toastsByMatterRef.current.delete(key);
        }
      }, effectiveDuration ?? 6500);
    }

    return newId;
  }, [showToast, updateToast]);

  const dismiss = React.useCallback((matterId: string) => {
    const key = String(matterId || '').trim() || '__no-matter__';
    const existing = toastsByMatterRef.current.get(key);
    if (!existing) return;
    hideToast(existing.toastId);
    toastsByMatterRef.current.delete(key);
  }, [hideToast]);

  const dismissAll = React.useCallback(() => {
    toastsByMatterRef.current.forEach(({ toastId }) => {
      try { hideToast(toastId); } catch { /* ignore */ }
    });
    toastsByMatterRef.current.clear();
  }, [hideToast]);

  return { upsert, dismiss, dismissAll };
}
