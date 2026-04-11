/**
 * Pipeline Contact Visibility data types and fetch helpers.
 * Calls the tab-app server proxy routes that forward to enquiry-processing-v2.
 */

export interface ContactVisibilityEntry {
  /** Bucket label: '<1h' | '1-4h' | '4-24h' | '24h+' */
  responseBucket?: string;
  feeEarnerContactBucket?: string;
  formalPitchBucket?: string;
  /** ISO timestamps */
  firstResponse?: string;
  feeEarnerContact?: string;
  formalPitch?: string;
}

/**
 * Fetch pipeline-activity summaries and response-metrics in parallel for a set of enquiry IDs.
 * Returns a merged map keyed by enquiry ID string.
 */
export async function fetchPipelineContactBatch(
  ids: string[],
): Promise<Map<string, ContactVisibilityEntry>> {
  if (ids.length === 0) return new Map();

  const idsParam = ids.join(',');
  const map = new Map<string, ContactVisibilityEntry>();

  try {
    const [activityRes, metricsRes] = await Promise.all([
      fetch(`/api/pipeline-activity/batch?ids=${idsParam}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`/api/response-metrics/batch?ids=${idsParam}`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ]);

    if (Array.isArray(activityRes)) {
      activityRes.forEach((entry: Record<string, unknown>) => {
        const key = String(entry.enquiryId ?? entry.id ?? '');
        if (!key) return;
        const existing = map.get(key) ?? {};
        map.set(key, {
          ...existing,
          firstResponse: entry.firstResponse as string | undefined,
          feeEarnerContact: entry.feeEarnerContact as string | undefined,
          formalPitch: entry.formalPitch as string | undefined,
        });
      });
    }

    if (Array.isArray(metricsRes)) {
      metricsRes.forEach((entry: Record<string, unknown>) => {
        const key = String(entry.enquiryId ?? entry.id ?? '');
        if (!key) return;
        const existing = map.get(key) ?? {};
        map.set(key, {
          ...existing,
          responseBucket: entry.responseBucket as string | undefined,
          feeEarnerContactBucket: entry.feeEarnerContactBucket as string | undefined,
          formalPitchBucket: entry.formalPitchBucket as string | undefined,
        });
      });
    }
  } catch (err) {
    console.error('[PipelineContactData] fetch error:', err);
  }

  return map;
}
