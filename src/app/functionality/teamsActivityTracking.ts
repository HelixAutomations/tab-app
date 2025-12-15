import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';

export interface TeamsActivityData {
  Id: number;
  ActivityId: string;
  ChannelId: string;
  TeamId: string;
  EnquiryId: string;
  LeadName: string;
  Email: string;
  Phone: string;
  CardType: string;
  MessageTimestamp: string;
  Stage: string;
  Status: string;
  ClaimedBy: string;
  ClaimedAt: string;
  CreatedAt: string;
  UpdatedAt: string;
  teamsLink: string;
}

/**
 * Fetch Teams activity tracking data for multiple enquiries
 * Batches requests to avoid 431 Request Header Fields Too Large error
 */
export async function fetchTeamsActivityTracking(enquiryIds: Array<number | string>): Promise<TeamsActivityData[]> {
  if (!enquiryIds || enquiryIds.length === 0) {
    return [];
  }

  // Batch size: avoid 431 header too large + SQL parameter limits (~2100 max)
  // Conservative: 100 IDs = ~1000 chars in URL, ~100 SQL params
  const BATCH_SIZE = 100;

  const tryFetch = async (base: string, ids: Array<number | string>): Promise<TeamsActivityData[]> => {
    const normalizedBase = base.replace(/\/?$/, '');
    const path = normalizedBase.endsWith('/api') ? '/teams-activity-tracking' : '/api/teams-activity-tracking';
    const url = `${normalizedBase}${path}?enquiryIds=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch teams activity tracking: ${res.status} ${res.statusText}`);
    }
    return res.json();
  };

  const fetchBatch = async (batch: Array<number | string>): Promise<TeamsActivityData[]> => {
    const primaryBase = getProxyBaseUrl();
    try {
      return await tryFetch(primaryBase, batch);
    } catch (err) {
      // If the primary target fails (e.g., cloud proxy missing the route),
      // fall back to same-origin relative API which will hit the local server in dev.
      if (primaryBase) {
        try {
          return await tryFetch('', batch);
        } catch (_) {
          // Ignore and rethrow original error below
        }
      }
      throw err;
    }
  };

  // Split into batches if needed
  if (enquiryIds.length <= BATCH_SIZE) {
    return fetchBatch(enquiryIds);
  }

  // Batching large request into multiple calls
  
  const batches: Array<Array<number | string>> = [];
  for (let i = 0; i < enquiryIds.length; i += BATCH_SIZE) {
    batches.push(enquiryIds.slice(i, i + BATCH_SIZE));
  }

  // Fetch batches with concurrency limit to avoid overwhelming server
  const CONCURRENT_LIMIT = 5;
  const results: TeamsActivityData[] = [];
  
  for (let i = 0; i < batches.length; i += CONCURRENT_LIMIT) {
    const chunk = batches.slice(i, i + CONCURRENT_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map((batch, chunkIndex) => {
        const batchIndex = i + chunkIndex;
        return fetchBatch(batch).catch(err => {
          console.error(`⚠️ Batch ${batchIndex + 1}/${batches.length} failed:`, err);
          return [];
        });
      })
    );
    results.push(...chunkResults.flat());
  }

  return results;
}

/**
 * Get Teams activity data for a specific enquiry ID
 */
export function getTeamsActivityForEnquiry(enquiryId: string, activityData: TeamsActivityData[]): TeamsActivityData | null {
  if (!enquiryId || !activityData || activityData.length === 0) {
    return null;
  }

  // Find the most recent activity for this enquiry
  const enquiryActivities = activityData.filter(activity => 
    activity.EnquiryId === enquiryId.toString() && activity.Status === 'active'
  );

  if (enquiryActivities.length === 0) {
    return null;
  }

  // Return the most recent activity (activities are already sorted by CreatedAt DESC from API)
  return enquiryActivities[0];
}

/**
 * Generate status dot color based on activity stage
 */
export function getActivityStatusColor(stage: string, isDarkMode: boolean): string {
  const stageColors = {
    new: isDarkMode ? '#60a5fa' : '#3b82f6', // Blue
    claimed: isDarkMode ? '#34d399' : '#10b981', // Green  
    active: isDarkMode ? '#fbbf24' : '#f59e0b', // Yellow
    redirected: isDarkMode ? '#a78bfa' : '#8b5cf6', // Purple
    removed: isDarkMode ? '#f87171' : '#ef4444', // Red
    archived: isDarkMode ? '#9ca3af' : '#6b7280', // Gray
    'out-of-scope': isDarkMode ? '#fb7185' : '#f43f5e', // Rose
  };

  const normalizedStage = stage?.toLowerCase();
  return (stageColors as any)[normalizedStage] || (isDarkMode ? '#9ca3af' : '#6b7280');
}