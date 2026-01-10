# Cache Analysis: User Data Isolation

## Current Caching Implementation

### Cache Key Structure

Redis keys follow this pattern:
```
{prefix}:{type}:{param1}:{param2}:...
```

Example keys:
- `rpt:userData:55354c77-72b9-4a0b-adcb-cc301112167a` (user-specific)
- `rpt:teamData` (shared)
- `rpt:wipClioCurrentWeek:team` (shared for all users)
- `stream:enquiries:team` (shared for all users)

### User Data Isolation Issues

#### ❌ **CRITICAL: Shared Caches Across Users**

Many datasets are cached **without user differentiation**:

**reporting.js (lines 18-75):**
```javascript
// SHARED - ALL USERS GET SAME DATA ❌
teamData: () => generateCacheKey('rpt', 'teamData')
enquiries: () => generateCacheKey('rpt', 'enquiries')  
allMatters: () => generateCacheKey('rpt', 'allMatters')
wip: () => generateCacheKey('rpt', 'wip')
recoveredFees: () => generateCacheKey('rpt', 'recoveredFees')
poidData: () => generateCacheKey('rpt', 'poidData')
wipDbLastWeek: () => generateCacheKey('rpt', 'wipDbLastWeek')
deals: () => generateCacheKey('rpt', 'deals')
instructions: () => generateCacheKey('rpt', 'instructions')

// USER-SPECIFIC - CORRECT ✅
userData: (entraId) => generateCacheKey('rpt', 'userData', entraId || 'anon')
recoveredFeesSummary: (entraId) => generateCacheKey('rpt', 'recoveredFeesSummary', entraId || 'anon')
wipClioCurrentWeek: (entraId) => generateCacheKey('rpt', 'wipClioCurrentWeek', entraId || 'team')
```

**reporting-stream.js (lines 169-170):**
```javascript
// For most datasets, uses 'team' as scopeKey when no entraId
const scopeKey = datasetName === 'wipClioCurrentWeek' ? 'team' : (entraId || 'team');
const cacheKey = generateCacheKey('stream', `${datasetName}:${scopeKey}${rangeSuffix}`);
```

### What This Means

1. **Team-wide data is intentionally shared** ✅
   - `teamData`, `allMatters`, `enquiries` → Everyone sees the same data
   - This is **CORRECT** - these are genuinely shared datasets

2. **User-specific data is properly isolated** ✅  
   - `userData` uses entraId in cache key
   - `recoveredFeesSummary` uses entraId in cache key
   - Each user gets their own cached data

3. **WIP data has mixed behavior** ⚠️
   - `wipClioCurrentWeek` defaults to `'team'` scope when no entraId provided
   - This means team-wide WIP is shared across users
   - **If** a request includes `entraId`, it caches separately per user

### Potential Issues

#### Issue #1: Role-Based Filtering Not in Cache Key ❌

**Problem:**
```javascript
// User A (Partner) requests allMatters
// → Gets full dataset, cached as 'rpt:allMatters'

// User B (Associate) requests allMatters  
// → Gets SAME cached data (not filtered by role)
// → Frontend must filter by role CLIENT-SIDE
```

**Impact**: If frontend filtering logic fails, users might see data they shouldn't.

**Current Mitigation**: Frontend filters data by user role/permissions AFTER receiving it.

#### Issue #2: WIP Scope Ambiguity ⚠️

**Problem:**
```javascript
// Request 1: /api/reporting-stream/stream-datasets?datasets=wipClioCurrentWeek
// → No entraId → Cached as 'stream:wipClioCurrentWeek:team'

// Request 2: /api/reporting-stream/stream-datasets?datasets=wipClioCurrentWeek&entraId=USER_A
// → Has entraId → Cached as 'stream:wipClioCurrentWeek:USER_A'

// Request 3: /api/reporting-stream/stream-datasets?datasets=wipClioCurrentWeek
// → No entraId → Gets cached 'team' version (might be stale if USER_A data updated)
```

**Impact**: Team view and user view can desync.

#### Issue #3: Clio Token Caching is Shared ⚠️

**Problem:**
```javascript
// reporting.js line 585
const cacheKey = 'clio:accessToken';
// ALL users share the same Clio access token
```

**Impact**: 
- If token refresh fails, ALL users affected
- No per-user Clio authentication
- **This is intentional** for team-wide WIP fetching, but means we can't have different users with different Clio permissions

### Cache TTL Configuration

**reporting.js:**
- userData: 5 min (300s)
- teamData: 30 min (1800s)
- enquiries: 5 min (300s)
- allMatters: 15 min (900s)
- wip: 5 min (300s)
- recoveredFees: 30 min (1800s)
- wipClioCurrentWeek: 5 min (300s)

**reporting-stream.js:**
- userData: 30 min (1800s)
- teamData: 1 hour (3600s)
- enquiries: 30 min (1800s)
- allMatters: 30 min (1800s)
- wip: 4 hours (14400s)
- recoveredFees: 8 hours (28800s) ← **Very long!**
- poidData: 6 hours (21600s)
- wipClioCurrentWeek: 30 min (1800s)

**Discrepancy**: Same dataset has different TTLs in different endpoints!

### Security Analysis

#### ✅ What's Working

1. **User-specific personal data is isolated**
   - userData cached per entraId
   - recoveredFeesSummary cached per entraId

2. **Sensitive data is hashed in cache keys**
   - Email addresses hashed: `h-{hash16}`
   - PII not exposed in Redis keys

3. **Frontend enforces permissions**
   - Data filtered client-side by role
   - Server returns all data, frontend shows subset

#### ❌ Potential Vulnerabilities

1. **No server-side role filtering**
   - SQL queries return ALL data
   - Cache contains full dataset
   - If frontend filter bypassed → data leak

2. **Shared cache keys allow cross-user access**
   - Any user can trigger cache population for team data
   - No validation that user has permission to that data
   - Relies entirely on frontend filtering

3. **Cache poisoning risk**
   - Malicious user could trigger cache of filtered data
   - Other users would get that filtered view
   - Example: Bypass `bypassCache=true` to force stale data

### Recommendations

#### High Priority

1. **Add role-based cache keys for filtered datasets**
   ```javascript
   // Instead of:
   generateCacheKey('rpt', 'allMatters')
   
   // Use:
   generateCacheKey('rpt', 'allMatters', userRole)
   // e.g., 'rpt:allMatters:partner' vs 'rpt:allMatters:associate'
   ```

2. **Implement server-side permission checks**
   - Filter SQL queries by user permissions
   - Don't rely solely on frontend filtering
   - Return only data user is authorized to see

3. **Normalize TTLs across endpoints**
   - Same dataset should have same TTL
   - Document why different TTLs if intentional

#### Medium Priority

4. **Add cache key validation**
   - Verify user has permission to cached data before returning
   - Log suspicious cache access patterns

5. **Separate team vs user WIP caching**
   - Always use entraId for user-specific WIP
   - Explicitly mark team-wide vs personal queries

6. **Add cache metrics/monitoring**
   - Track cache hit/miss rates per dataset
   - Alert on unusual access patterns
   - Monitor cache size per user

#### Low Priority

7. **Document cache architecture**
   - Which datasets are shared vs user-specific
   - Why certain data is team-wide
   - Cache invalidation strategy

8. **Add cache admin endpoints**
   - Clear user-specific cache
   - Clear team cache
   - Inspect cache keys for debugging

## Current User Data Access Pattern

### Scenario: User Opens Reporting Page

1. Frontend calls `/api/reporting-stream/stream-datasets?entraId={userId}&datasets=userData,teamData,enquiries,allMatters,wip,recoveredFees`

2. **userData**: Cached per user → ✅ Isolated
3. **teamData**: Cached as `team` → ⚠️ Shared (intentional)
4. **enquiries**: Cached as `team` → ⚠️ Shared (ALL enquiries)
5. **allMatters**: Cached as `team` → ⚠️ Shared (ALL matters)
6. **wip**: Cached as `team` → ⚠️ Shared (ALL WIP)
7. **recoveredFees**: Cached as `team` → ⚠️ Shared (ALL fees)

**Frontend then filters** based on user role/permissions.

### The "Wrong Data" Issue

If users report seeing wrong data, likely causes:

1. **Stale cache** - Data cached before recent changes
2. **Frontend filter failure** - Client-side filtering broke
3. **Wrong user context** - entraId not passed correctly
4. **Cross-user cache collision** - Two users with same cache key (shouldn't happen with current implementation)
5. **Time zone issues** - Date filtering using wrong timezone

**Most likely**: Frontend filtering not working correctly, exposing shared cached data.

## Action Items

- [ ] Review frontend filtering logic in Management Dashboard
- [ ] Add server-side SQL WHERE clauses for user permissions
- [ ] Add role to cache keys where appropriate
- [ ] Normalize TTLs between reporting.js and reporting-stream.js
- [ ] Add cache monitoring/logging
- [ ] Document which datasets are intentionally shared
