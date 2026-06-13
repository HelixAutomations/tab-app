import { useEffect, useState, useCallback } from 'react';

export interface ColumnDefinition {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

const STORAGE_KEY_PREFIX = 'helix-column-visibility:';

export function useColumnVisibility(tableId: string, columns: ColumnDefinition[]) {
  const storageKey = `${STORAGE_KEY_PREFIX}${tableId}`;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    // Load from localStorage or use defaults
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.warn(`Failed to load column visibility for ${tableId}:`, err);
    }

    // Use default visibility
    return new Set(
      columns
        .filter((col) => col.defaultVisible !== false)
        .map((col) => col.key)
    );
  });

  const handleToggleColumn = useCallback((columnKey: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  const handleShowAll = useCallback(() => {
    setVisibleColumns(new Set(columns.map((col) => col.key)));
  }, [columns]);

  const handleHideAll = useCallback(() => {
    setVisibleColumns(new Set());
  }, []);

  const handleReset = useCallback(() => {
    const defaults = new Set(
      columns
        .filter((col) => col.defaultVisible !== false)
        .map((col) => col.key)
    );
    setVisibleColumns(defaults);
  }, [columns]);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(visibleColumns)));
    } catch (err) {
      console.warn(`Failed to save column visibility for ${tableId}:`, err);
    }
  }, [visibleColumns, storageKey]);

  return {
    visibleColumns,
    handleToggleColumn,
    handleShowAll,
    handleHideAll,
    handleReset,
  };
}
