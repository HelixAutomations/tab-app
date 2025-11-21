import { Enquiry } from '../../app/functionality/types';
import { isGenericProspectEmail, isSharedProspectRecord } from './sharedProspects';

export interface GroupedEnquiry {
  clientKey: string;
  clientName: string;
  clientEmail: string;
  enquiries: Enquiry[];
  latestDate: string;
  totalValue: number;
  areas: string[];
}

/**
 * Groups enquiries by client based on email address and name
 * @param enquiries Array of enquiries to group
 * @returns Array of grouped enquiries with repeated clients combined
 */
export function groupEnquiriesByClient(enquiries: Enquiry[]): GroupedEnquiry[] {
  const groupMap = new Map<string, GroupedEnquiry>();

  enquiries.forEach((enquiry) => {
    // Create a unique key based on email and normalized name
    const normalizedEmail = enquiry.Email?.toLowerCase().trim() || '';
    const normalizedName = `${enquiry.First_Name?.toLowerCase().trim()} ${enquiry.Last_Name?.toLowerCase().trim()}`.trim();
    
    // Check if this is a team email (e.g., prospects@helix-law.com, team@helix-law.com)
    const isTeamEmail = normalizedEmail.includes('@prospects') || 
                       normalizedEmail.includes('@team') ||
                       normalizedEmail === 'team@helix-law.com' ||
                       normalizedEmail === 'prospects@helix-law.com';
    
    // CRITICAL FIX: Always force ID-based grouping for shared prospect IDs,
    // regardless of email type. This ensures all records with the same shared ID
    // (28609, 23849, 26069) are grouped together, whether they have personal 
    // emails (Andy Gelder, Matt Talaie) or generic emails (prospects@)
    const forceIdGrouping = Boolean(
      enquiry.ID && isSharedProspectRecord(enquiry)
    );
    
    // For team emails, use name as primary key to keep different people separate
    // For personal emails, use email as primary key
    let clientKey: string;
    if (forceIdGrouping) {
      clientKey = `id:${enquiry.ID}`;
    } else if (isTeamEmail && normalizedName) {
      clientKey = normalizedName; // Use name for team emails
    } else {
      clientKey = normalizedEmail || normalizedName || (enquiry.ID ? `id:${enquiry.ID}` : ''); // Use email, fall back to name or ID
    }
    
    if (!clientKey) return; // Skip enquiries without identifiable client info

    const derivedName = forceIdGrouping
      ? `Shared Prospect ${enquiry.ID}`
      : `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim() || (enquiry.ID ? `Prospect ${enquiry.ID}` : 'Unknown contact');
    const clientEmail = forceIdGrouping
      ? 'prospects@helix-law.com'
      : (enquiry.Email || '');

    if (groupMap.has(clientKey)) {
      // Add to existing group
      const existingGroup = groupMap.get(clientKey)!;
      existingGroup.enquiries.push(enquiry);
      
      // Update latest date if this enquiry is more recent
      if (enquiry.Touchpoint_Date > existingGroup.latestDate) {
        existingGroup.latestDate = enquiry.Touchpoint_Date;
        existingGroup.clientName = derivedName;
        if (clientEmail) {
          existingGroup.clientEmail = clientEmail;
        }
      }
      
      // Add area if not already present
      if (enquiry.Area_of_Work && !existingGroup.areas.includes(enquiry.Area_of_Work)) {
        existingGroup.areas.push(enquiry.Area_of_Work);
      }
    } else {
      // Create new group
      groupMap.set(clientKey, {
        clientKey,
        clientName: derivedName,
        clientEmail,
        enquiries: [enquiry],
        latestDate: enquiry.Touchpoint_Date || '',
        totalValue: 0, // Will be calculated later if needed
        areas: enquiry.Area_of_Work ? [enquiry.Area_of_Work] : [],
      });
    }
  });

  // Convert map to array and sort by latest date (most recent first)
  const groupedEnquiries = Array.from(groupMap.values());
  
  // Sort enquiries within each group by date (most recent first)
  groupedEnquiries.forEach(group => {
    group.enquiries.sort((a, b) => {
      const dateA = new Date(a.Touchpoint_Date || '').getTime();
      const dateB = new Date(b.Touchpoint_Date || '').getTime();
      return dateB - dateA; // Most recent first
    });
  });

  // Sort groups by latest enquiry date (most recent first)
  groupedEnquiries.sort((a, b) => {
    const dateA = new Date(a.latestDate).getTime();
    const dateB = new Date(b.latestDate).getTime();
    return dateB - dateA;
  });

  return groupedEnquiries;
}

/**
 * Separates single enquiries from grouped enquiries
 * @param groupedEnquiries Array of grouped enquiries
 * @returns Object with single enquiries and repeated enquiries separated
 */
export function separateRepeatedEnquiries(groupedEnquiries: GroupedEnquiry[]): {
  singleEnquiries: Enquiry[];
  repeatedEnquiries: GroupedEnquiry[];
} {
  const singleEnquiries: Enquiry[] = [];
  const repeatedEnquiries: GroupedEnquiry[] = [];

  groupedEnquiries.forEach(group => {
    if (group.enquiries.length === 1) {
      singleEnquiries.push(group.enquiries[0]);
    } else {
      repeatedEnquiries.push(group);
    }
  });

  return { singleEnquiries, repeatedEnquiries };
}

/**
 * Gets a mixed array of single and grouped enquiries for display
 * @param enquiries Array of enquiries to process
 * @returns Array containing both single enquiries and grouped enquiries
 */
export function getMixedEnquiryDisplay(enquiries: Enquiry[]): (Enquiry | GroupedEnquiry)[] {
  const grouped = groupEnquiriesByClient(enquiries);
  const result: (Enquiry | GroupedEnquiry)[] = [];

  grouped.forEach(group => {
    if (group.enquiries.length === 1) {
      // Check if this is a shared prospect record that should always be treated as a group
      const enquiry = group.enquiries[0];
      const isSharedProspect = Boolean(enquiry.ID && isSharedProspectRecord(enquiry));
      
      if (isSharedProspect) {
        // Keep shared prospect records as grouped enquiries for consistent display
        result.push(group);
      } else {
        // Single enquiry - add the enquiry itself
        result.push(enquiry);
      }
    } else {
      // Multiple enquiries - add the grouped enquiry
      result.push(group);
    }
  });

  return result;
}

/**
 * Type guard to check if an item is a GroupedEnquiry
 * @param item Item to check
 * @returns True if the item is a GroupedEnquiry
 */
export function isGroupedEnquiry(item: Enquiry | GroupedEnquiry): item is GroupedEnquiry {
  return 'enquiries' in item && Array.isArray((item as GroupedEnquiry).enquiries);
}
