import { Matter, NormalizedMatter } from '../app/functionality/types';

export type MatterDataSource = 'legacy_all' | 'legacy_user' | 'vnet_direct';

// Cache for normalized names to avoid repeated string operations
const nameNormalizationCache = new Map<string, string>();

/**
 * Checks if two names match, accounting for common variations
 * Optimized with memoization cache to avoid redundant normalization
 */
function normalizePersonName(name: string): string {
  if (!name) return '';
  
  // Check cache first
  if (nameNormalizationCache.has(name)) {
    return nameNormalizationCache.get(name)!;
  }
  
  let n = String(name).toLowerCase().trim();
  // Handle "Last, First" → "first last"
  if (n.includes(',')) {
    const [last, first] = n.split(',').map(p => p.trim());
    if (first && last) n = `${first} ${last}`;
  }
  // Remove periods in initials (e.g., "r. chapman")
  n = n.replace(/\./g, '');
  // Strip parenthetical content (e.g., "richard chapman (rc)")
  n = n.replace(/\s*\([^)]*\)\s*/g, ' ');
  // Remove trailing decorations after separators like " - ", "/", or "|"
  n = n.replace(/\s[-/|].*$/, '');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  
  // Cache result
  nameNormalizationCache.set(name, n);
  
  // Prevent memory leak - limit cache size to 500 unique names
  if (nameNormalizationCache.size > 500) {
    const firstKey = nameNormalizationCache.keys().next().value;
    if (firstKey) nameNormalizationCache.delete(firstKey);
  }
  
  return n;
}

function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizePersonName(name1);
  const n2 = normalizePersonName(name2);
  const compact1 = n1.replace(/\s+/g, '');
  const compact2 = n2.replace(/\s+/g, '');
  const initialsFrom = (value: string) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0] || '')
      .join('');
  
  // Exact match
  if (n1 === n2) return true;

  // Initials match (e.g., "LZ" vs "Luke Zemanek")
  const initials1 = initialsFrom(n1);
  const initials2 = initialsFrom(n2);
  if (compact1 && compact1.length <= 3 && compact1 === initials2) return true;
  if (compact2 && compact2.length <= 3 && compact2 === initials1) return true;
  
  // Common name variations mapping
  const nameVariations: { [key: string]: string[] } = {
    'lukasz': ['luke', 'lucas'],
    'luke': ['lukasz', 'lucas'],
    'lucas': ['luke', 'lukasz'],
    'samuel': ['sam'],
    'sam': ['samuel'],
    'alexander': ['alex'],
    'alex': ['alexander'],
    'william': ['will', 'bill'],
    'will': ['william'],
    'bill': ['william'],
    'robert': ['rob', 'bob'],
    'rob': ['robert'],
    'bob': ['robert'],
    'michael': ['mike'],
    'mike': ['michael'],
    'christopher': ['chris'],
    'chris': ['christopher'],
    'elizabeth': ['liz', 'beth'],
    'liz': ['elizabeth'],
    'beth': ['elizabeth']
  };
  
  // Split names into parts (first name, last name)
  const n1Parts = n1.split(' ');
  const n2Parts = n2.split(' ');

  // If either name lacks a last name, fall back to first-name comparison with variations
  if (n1Parts.length < 2 || n2Parts.length < 2) {
    const firstName1 = n1Parts[0];
    const firstName2 = n2Parts[0];

    if (firstName1 === firstName2) return true;

    const variations1 = nameVariations[firstName1] || [];
    const variations2 = nameVariations[firstName2] || [];
    if (variations1.includes(firstName2) || variations2.includes(firstName1)) {
      return true;
    }

    return false;
  }

  // Check if first names match (with variations) and last names match
  if (n1Parts.length >= 2 && n2Parts.length >= 2) {
    const firstName1 = n1Parts[0];
    const lastName1 = n1Parts[n1Parts.length - 1];
    const firstName2 = n2Parts[0];
    const lastName2 = n2Parts[n2Parts.length - 1];
    
    // Last names must match exactly
    if (lastName1 === lastName2) {
      // Check if first names match or are variations
      if (firstName1 === firstName2) return true;
      
      // Check variations
      const variations1 = nameVariations[firstName1] || [];
      const variations2 = nameVariations[firstName2] || [];
      
      if (variations1.includes(firstName2) || variations2.includes(firstName1)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Determines user's role in a matter based on responsible and originating solicitor
 */
export function determineUserRole(
  userFullName: string,
  responsibleSolicitor: string,
  originatingSolicitor: string
): 'responsible' | 'originating' | 'both' | 'none' {
  const isResponsible = namesMatch(userFullName, responsibleSolicitor);
  const isOriginating = namesMatch(userFullName, originatingSolicitor);

  const role = isResponsible && isOriginating ? 'both' :
               isResponsible ? 'responsible' :
               isOriginating ? 'originating' :
               'none';

  // Debug role determinations (controlled by flag)
  const DEBUG_ROLE_DETERMINATION = false;
  if (DEBUG_ROLE_DETERMINATION && Math.random() < 0.1) { // 10% sample when enabled
    
  }

  return role;
}

/**
 * Determines matter status based on close date
 */
export function determineMatterStatus(closeDate: string | null | undefined): 'active' | 'closed' {
  if (!closeDate || closeDate.trim() === '') return 'active';
  
  // Try to parse the date - if it's a valid date, consider it closed
  try {
    const parsed = new Date(closeDate);
    if (!isNaN(parsed.getTime())) return 'closed';
  } catch {
    // If parsing fails, check for common close indicators
  }
  
  // Check for common "closed" indicators in the string
  const closedIndicators = ['closed', 'complete', 'completed', 'finished'];
  const lowerCloseDate = closeDate.toLowerCase();
  if (closedIndicators.some(indicator => lowerCloseDate.includes(indicator))) {
    return 'closed';
  }
  
  return 'active';
}

/**
 * Normalizes matter data from any source into consistent NormalizedMatter format
 */
export function normalizeMatterData(
  matter: any,
  userFullName: string,
  dataSource: MatterDataSource
): NormalizedMatter {
  // Debug matter data (controlled by flag)
  const DEBUG_MATTER_NORMALIZATION = false;
  if (DEBUG_MATTER_NORMALIZATION && Math.random() < 0.1) { // 10% sample when enabled
    console.log(`🔍 Raw matter data from ${dataSource}:`, {
      matter,
      keys: Object.keys(matter)
    });
  }

  // Handle different field naming conventions from different sources
  // New schema (with uppercase): MatterID, DisplayNumber, etc.
  // Old schema (with spaces): "Display Number", "Client Name", etc.
  // VNet schema (snake_case): matter_id, display_number, etc.
  
  // Prefer strong identifiers; support multiple legacy/new variants
  const matterId =
    matter.MatterID ||
    matter['Unique ID'] || // legacy with space
    matter.UniqueID || // legacy mapped without space
    matter.unique_id ||
    matter.matter_id ||
    matter.id ||
    '';
  const displayNumber = matter.DisplayNumber || matter['Display Number'] || matter.display_number || matter.number || '';
  const clientName = matter.ClientName || matter['Client Name'] || matter.client_name || matter.clientName || '';
  const description = matter.Description || matter.Description || matter.description || matter.matter_name || '';
  const responsibleSolicitor = matter.ResponsibleSolicitor || matter['Responsible Solicitor'] || matter.responsible_solicitor || matter.responsibleSolicitor || '';
  const originatingSolicitor = matter.OriginatingSolicitor || matter['Originating Solicitor'] || matter.originating_solicitor || matter.originatingSolicitor || '';
  const practiceArea = matter.PracticeArea || matter['Practice Area'] || matter.practice_area || matter.practiceArea || '';
  const openDate = matter.OpenDate || matter['Open Date'] || matter.open_date || matter.openDate || '';
  const closeDate = matter.CloseDate || matter['Close Date'] || matter.close_date || matter.closeDate || null;
  const originalStatus = matter.Status || matter.status || matter.original_status || matter.originalStatus;

  // Determine computed fields
  const status = determineMatterStatus(closeDate);
  const role = determineUserRole(userFullName, responsibleSolicitor, originatingSolicitor);

  return {
    // Core identifiers
    matterId,
    matterName: description,
    displayNumber,
    instructionRef: matter.InstructionRef || matter.instruction_ref || matter.instructionRef,
    
    // Dates
    openDate,
    closeDate,
    
    // Status
    status,
  originalStatus,
    
    // Client information
    clientId: matter.ClientID || matter['Client ID'] || matter.client_id || matter.clientId || '',
    clientName,
    clientPhone: matter.ClientPhone || matter.client_phone || matter.clientPhone,
    clientEmail: matter.ClientEmail || matter.client_email || matter.clientEmail,
    
    // Matter details
    description,
    practiceArea,
    source: matter.Source || matter.source,
    referrer: matter.Referrer || matter.referrer,
    value: matter.ApproxValue || matter['Approx. Value'] || matter.approx_value || matter.value,
    
    // Solicitors
    responsibleSolicitor,
    originatingSolicitor,
    supervisingPartner: matter.SupervisingPartner || matter['Supervising Partner'] || matter.supervising_partner || matter.supervisingPartner,
    
    // Opposition
    opponent: matter.Opponent || matter.opponent,
    opponentSolicitor: matter.OpponentSolicitor || matter['Opponent Solicitor'] || matter.opponent_solicitor || matter.opponentSolicitor,
    
    // User role (computed)
    role,
    
    // Metadata
    methodOfContact: matter.method_of_contact || matter.methodOfContact,
    cclDate: matter.CCL_date || matter.ccl_date || matter.cclDate,
    rating: matter.Rating || matter.rating,
    modStamp: matter.mod_stamp || matter.modStamp,
    
    // Source tracking
    dataSource,
    
    // Raw data for debugging
    _raw: matter,
  };
}

/**
 * Filters normalized matters based on user role
 */
export function filterMattersByRole(
  matters: NormalizedMatter[],
  allowedRoles: ('responsible' | 'originating' | 'both')[]
): NormalizedMatter[] {
  return matters.filter(matter => 
    allowedRoles.includes(matter.role as any) || matter.role === 'both'
  );
}

/**
 * Filters normalized matters based on status
 */
export function filterMattersByStatus(
  matters: NormalizedMatter[],
  status: 'active' | 'closed' | 'all'
): NormalizedMatter[] {
  if (status === 'all') return matters;
  return matters.filter(matter => matter.status === status);
}

/**
 * Filters normalized matters based on practice area
 */
export function filterMattersByArea(
  matters: NormalizedMatter[],
  practiceArea: string
): NormalizedMatter[] {
  if (practiceArea === 'All' || !practiceArea) return matters;
  return matters.filter(matter => 
    matter.practiceArea?.toLowerCase() === practiceArea.toLowerCase()
  );
}

/**
 * Checks if user has admin access to see everyone's matters
 *
 * Restores special handling for the LZ admin (Lukasz/Luke Zemanek):
 * - Treat initials "LZ" as admin
 * - Treat name variants containing "lukasz", "luke", or "zemanek" as admin
 * Also treats roles including "admin" or names including "alex" as admin (existing behavior).
 */
export function hasAdminAccess(userRole: string, userFullName: string): boolean {
  const role = (userRole || '').toLowerCase();
  const name = (userFullName || '').toLowerCase().trim();

  // Derive initials from full name (e.g., "Lukasz Zemanek" -> "LZ")
  const initials = (userFullName || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase();

  const isLZ = initials === 'LZ' || name.includes('lukasz') || name.includes('luke') || name.includes('zemanek');
  const isAdminByRole = role.includes('admin');
  const isKnownAdminByName = name.includes('alex') || name.includes('laura');

  return isAdminByRole || isKnownAdminByName || isLZ;
}

/**
 * Applies admin filter - if admin toggle is off, filter to user's matters only
 */
export function applyAdminFilter(
  matters: NormalizedMatter[],
  showEveryone: boolean,
  userFullName: string,
  userRole: string
): NormalizedMatter[] {
  const DEBUG_ADMIN_FILTER = false;
  if (DEBUG_ADMIN_FILTER) {
    
  }
  
  // If user is not admin, always filter to their matters
  if (!hasAdminAccess(userRole, userFullName)) {
    const filtered = matters.filter(matter => matter.role !== 'none');
    if (DEBUG_ADMIN_FILTER) {
      
    }
    return filtered;
  }
  
  // If admin and "show everyone" is enabled, show all matters
  if (showEveryone) {
    if (DEBUG_ADMIN_FILTER) {
      
    }
    return matters;
  }
  
  // If admin but "show everyone" is disabled, filter to their matters
  const filtered = matters.filter(matter => matter.role !== 'none');
  if (DEBUG_ADMIN_FILTER) {
    
  }
  return filtered;
}

/**
 * Gets unique practice areas from normalized matters
 */
export function getUniquePracticeAreas(matters: NormalizedMatter[]): string[] {
  const areas = new Set<string>();
  matters.forEach(matter => {
    if (matter.practiceArea) {
      areas.add(matter.practiceArea);
    }
  });
  return Array.from(areas).sort();
}

/**
 * Merges matters from multiple sources, deduplicating by matter ID
 */
export function mergeMattersFromSources(
  allMatters: Matter[],
  userMatters: Matter[],
  vnetMatters: any[],
  userFullName: string
): NormalizedMatter[] {
  const normalizedMatters = new Map<string, NormalizedMatter>();
  
  // Process all matters (lowest priority)
  allMatters.forEach(matter => {
    const normalized = normalizeMatterData(matter, userFullName, 'legacy_all');
    if (normalized.matterId) {
      normalizedMatters.set(normalized.matterId, normalized);
    }
  });
  
  // Process user-specific matters (medium priority, can override)
  userMatters.forEach(matter => {
    const normalized = normalizeMatterData(matter, userFullName, 'legacy_user');
    if (normalized.matterId) {
      normalizedMatters.set(normalized.matterId, normalized);
    }
  });
  
  // Process VNet matters (highest priority)
  vnetMatters.forEach(matter => {
    const normalized = normalizeMatterData(matter, userFullName, 'vnet_direct');
    if (normalized.matterId) {
      normalizedMatters.set(normalized.matterId, normalized);
    }
  });
  
  return Array.from(normalizedMatters.values());
}
