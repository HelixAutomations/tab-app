import { useState, useEffect, useRef } from 'react';
import { fetchPipelineContactBatch, ContactVisibilityEntry } from '../../../app/functionality/pipelineContactData';

/**
 * Incrementally fetches pipeline contact visibility data for currently visible enquiries.
 * Fires when new IDs appear in `visibleIds` that haven't been fetched yet.
 */
export function usePipelineContactData(
  visibleIds: Set<string>,
): Map<string, ContactVisibilityEntry> {
  const [contactMap, setContactMap] = useState<Map<string, ContactVisibilityEntry>>(new Map());
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef(false);
  const visibleIdsKey = [...visibleIds].filter(Boolean).sort().join('|');

  useEffect(() => {
    const currentVisibleIds = visibleIdsKey ? visibleIdsKey.split('|') : [];
    const idsToFetch = currentVisibleIds.filter(
      (id) => id && !fetchedIdsRef.current.has(id),
    );
    if (idsToFetch.length === 0 || inflightRef.current) return;

    inflightRef.current = true;

    fetchPipelineContactBatch(idsToFetch)
      .then((batch) => {
        if (batch.size === 0) return;
        setContactMap((prev) => {
          const next = new Map(prev);
          let changed = false;
          batch.forEach((entry, key) => {
            const previous = prev.get(key);
            const sameEntry = previous
              && previous.responseBucket === entry.responseBucket
              && previous.feeEarnerContactBucket === entry.feeEarnerContactBucket
              && previous.formalPitchBucket === entry.formalPitchBucket
              && previous.firstResponse === entry.firstResponse
              && previous.feeEarnerContact === entry.feeEarnerContact
              && previous.formalPitch === entry.formalPitch;
            if (sameEntry) return;
            next.set(key, entry);
            changed = true;
          });
          return changed ? next : prev;
        });
      })
      .finally(() => {
        idsToFetch.forEach((id) => fetchedIdsRef.current.add(id));
        inflightRef.current = false;
      });
  }, [visibleIdsKey]);

  return contactMap;
}
