import { useState, useEffect, useRef } from 'react';
import { fetchPipelineContactBatch, ContactVisibilityEntry } from '../../../app/functionality/pipelineContactData';

/**
 * Incrementally fetches pipeline contact visibility data for visible enquiries.
 * Fires when new IDs appear in `visibleIds` that haven't been fetched yet.
 */
export function usePipelineContactData(
  visibleIds: Set<string>,
): Map<string, ContactVisibilityEntry> {
  const [contactMap, setContactMap] = useState<Map<string, ContactVisibilityEntry>>(new Map());
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef(false);

  useEffect(() => {
    const idsToFetch = [...visibleIds].filter(
      (id) => id && !fetchedIdsRef.current.has(id),
    );
    if (idsToFetch.length === 0 || inflightRef.current) return;

    inflightRef.current = true;

    fetchPipelineContactBatch(idsToFetch)
      .then((batch) => {
        if (batch.size === 0) return;
        setContactMap((prev) => {
          const next = new Map(prev);
          batch.forEach((entry, key) => next.set(key, entry));
          return next;
        });
      })
      .finally(() => {
        idsToFetch.forEach((id) => fetchedIdsRef.current.add(id));
        inflightRef.current = false;
      });
  }, [visibleIds]);

  return contactMap;
}
