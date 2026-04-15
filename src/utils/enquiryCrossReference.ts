/**
 * Cross-reference utilities for matching enquiries between old (helix-core-data) 
 * and new (instructions) database systems during migration transition.
 */

import { colours } from '../app/styles/colours';

export interface OldEnquiry {
  ID: string;
  Date_Created: string;
  Email: string;
  First_Name: string;
  Last_Name: string;
  Company?: string;
  Point_of_Contact: string;
  Matter_Ref?: string;
  // Additional fields as needed
}

export interface NewEnquiry {
  id: number;
  datetime: string;
  first: string;
  last: string;
  email: string;
  poc: string;
  stage?: string;
  claim?: string;
  // Additional fields as needed
}

export interface CrossReferenceMatch {
  oldId: string;
  newId?: number;
  matchType: 'exact' | 'partial' | 'none';
  matchScore: number;
  matchReasons: string[];
  migrationStatus: 'migrated' | 'partial' | 'not-migrated' | 'sync-pending';
}

/**
 * Compare two strings with fuzzy matching for names/emails
 */
function fuzzyMatch(str1: string, str2: string, threshold = 0.8): boolean {
  if (!str1 || !str2) return false;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return true;
  
  // Simple similarity check - could be enhanced with Levenshtein distance
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  const similarity = (longer.length - editDistance) / longer.length;
  
  return similarity >= threshold;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Parse date strings to Date objects for comparison
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Check if two dates are within a reasonable range (same day or close)
 */
function datesMatch(date1: string, date2: string, daysTolerance = 1): boolean {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  
  if (!d1 || !d2) return false;
  
  const diffTime = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  return diffDays <= daysTolerance;
}

/**
 * Find potential matches for an old enquiry in the new system
 */
export function findMatches(oldEnquiry: OldEnquiry, newEnquiries: NewEnquiry[]): CrossReferenceMatch {
  const matches = newEnquiries.map(newEnq => {
    const matchReasons: string[] = [];
    let score = 0;
    
    // Email match (highest priority)
    if (oldEnquiry.Email && newEnq.email && 
        oldEnquiry.Email.toLowerCase().trim() === newEnq.email.toLowerCase().trim()) {
      score += 50;
      matchReasons.push('Exact email match');
    }
    
    // Name match
    const oldFullName = `${oldEnquiry.First_Name || ''} ${oldEnquiry.Last_Name || ''}`.trim();
    const newFullName = `${newEnq.first || ''} ${newEnq.last || ''}`.trim();
    
    if (oldFullName && newFullName) {
      if (fuzzyMatch(oldFullName, newFullName, 0.9)) {
        score += 30;
        matchReasons.push('Name match');
      } else if (fuzzyMatch(oldEnquiry.First_Name || '', newEnq.first || '', 0.8) ||
                 fuzzyMatch(oldEnquiry.Last_Name || '', newEnq.last || '', 0.8)) {
        score += 15;
        matchReasons.push('Partial name match');
      }
    }
    
    // Date proximity
    if (datesMatch(oldEnquiry.Date_Created, newEnq.datetime, 2)) {
      score += 20;
      matchReasons.push('Date proximity');
    }
    
    // POC match (if available)
    if (oldEnquiry.Point_of_Contact && newEnq.poc &&
        oldEnquiry.Point_of_Contact.toLowerCase().trim() === newEnq.poc.toLowerCase().trim()) {
      score += 10;
      matchReasons.push('POC match');
    }
    
    return {
      newId: newEnq.id,
      score,
      matchReasons,
      newEnquiry: newEnq
    };
  });
  
  // Find best match
  const bestMatch = matches.length > 0 
    ? matches.reduce((best, current) => current.score > best.score ? current : best)
    : { newId: undefined as number | undefined, score: 0, matchReasons: [] as string[], newEnquiry: null as NewEnquiry | null };
  
  let matchType: 'exact' | 'partial' | 'none';
  let migrationStatus: 'migrated' | 'partial' | 'not-migrated' | 'sync-pending';
  
  if (bestMatch.score >= 70) {
    matchType = 'exact';
    migrationStatus = 'migrated';
  } else if (bestMatch.score >= 30) {
    matchType = 'partial';
    migrationStatus = 'partial';
  } else {
    matchType = 'none';
    migrationStatus = 'not-migrated';
  }
  
  return {
    oldId: oldEnquiry.ID,
    newId: bestMatch.newId,
    matchType,
    matchScore: bestMatch.score,
    matchReasons: bestMatch.matchReasons,
    migrationStatus
  };
}

/**
 * Batch cross-reference all old enquiries against new ones
 */
export function crossReferenceEnquiries(
  oldEnquiries: OldEnquiry[], 
  newEnquiries: NewEnquiry[]
): CrossReferenceMatch[] {
  return oldEnquiries.map(oldEnq => findMatches(oldEnq, newEnquiries));
}

/**
 * Get migration statistics
 */
export function getMigrationStats(matches: CrossReferenceMatch[]) {
  const stats = {
    total: matches.length,
    migrated: 0,
    partial: 0,
    notMigrated: 0,
    syncPending: 0
  };
  
  matches.forEach(match => {
    switch (match.migrationStatus) {
      case 'migrated':
        stats.migrated++;
        break;
      case 'partial':
        stats.partial++;
        break;
      case 'not-migrated':
        stats.notMigrated++;
        break;
      case 'sync-pending':
        stats.syncPending++;
        break;
    }
  });
  
  return {
    ...stats,
    migrationRate: (stats.migrated / stats.total * 100).toFixed(1),
    completionRate: ((stats.migrated + stats.partial) / stats.total * 100).toFixed(1)
  };
}

/**
 * Status indicators for UI display
 */
export function getStatusIndicator(match: CrossReferenceMatch) {
  switch (match.migrationStatus) {
    case 'migrated':
      return { icon: '✅', label: 'Migrated', color: colours.green };
    case 'partial':
      return { icon: '⚠️', label: 'Partial', color: colours.orange };
    case 'not-migrated':
      return { icon: '❌', label: 'Not Migrated', color: colours.cta };
    case 'sync-pending':
      return { icon: '🔄', label: 'Sync Pending', color: colours.highlight };
    default:
      return { icon: '❓', label: 'Unknown', color: '#6b7280' };
  }
}