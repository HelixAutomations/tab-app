# Caching System Fixes - Applied

## Summary
Fixed 7 critical caching stability issues in the reporting system. The cache will now be predictable and stable.

---

## Fixes Applied

### ✅ **Fix 1: Remove TTL Extension on Cache Hits**

**File:** `server/routes/reporting-stream.js` (line 148)

**Before:**
```javascript
const extendedTtl = isHeavyDataset ? baseTtl * 3 : baseTtl * 2;
await redisClient.expire(cacheKey, extendedTtl);
```

**After:**
```javascript
// DO NOT extend TTL on cache hit - this causes data to become permanently stale
// Instead, let the cache expire naturally at its original TTL
console.log(`📋 Using cached ${datasetName} at original TTL (no extension)`);
```

**Impact:** 
- ✅ Data now expires at a predictable time
- ✅ No more "permanent staleness" from repeated hits
- ✅ Guarantees fresh data fetch every `DATASET_TTL` seconds

---

### ✅ **Fix 2: Add Timestamps to Cached Data**

**File:** `server/routes/reporting-stream.js` (line 172)

**Before:**
```javascript
await redisClient.setEx(cacheKey, extendedTtl, JSON.stringify(result));
```

**After:**
```javascript
const cachePayload = {
  data: result,
  timestamp: Date.now(),
  ttl: ttl
};
await redisClient.setEx(cacheKey, ttl, JSON.stringify(cachePayload));
console.log(`📋 Dataset ${datasetName} cached (TTL: ${ttl}s, expires at ${new Date(Date.now() + ttl * 1000).toISOString()})`);
```

**Impact:**
- ✅ Server logs now show exact expiration time
- ✅ Data age is logged on cache hit: `data age: 45s`
- ✅ Backward compatible: code handles old format too

---

### ✅ **Fix 3: Extract and Log Cache Age**

**File:** `server/routes/reporting-stream.js` (line 138)

**Before:**
```javascript
const cached = await redisClient.get(cacheKey);
if (cached) {
  result = JSON.parse(cached);
  console.log(`📋 Dataset ${datasetName} cache hit (Redis) in ${cacheTime}ms`);
}
```

**After:**
```javascript
const cached = await redisClient.get(cacheKey);
if (cached) {
  try {
    const cachePayload = JSON.parse(cached);
    // Support both old format (raw data) and new format (with timestamp)
    result = cachePayload.data !== undefined ? cachePayload.data : cachePayload;
    const cacheAge = cachePayload.timestamp ? Date.now() - cachePayload.timestamp : 0;
    console.log(`📋 Dataset ${datasetName} cache hit (Redis) in ${cacheTime}ms - data age: ${Math.round(cacheAge / 1000)}s`);
  } catch (parseError) {
    console.warn(`Failed to parse cache payload for ${datasetName}:`, parseError.message);
    result = null;
  }
}
```

**Impact:**
- ✅ Server logs show how old cached data is
- ✅ Easy to diagnose stale data issues
- ✅ Can spot when cache is stuck (always same age)

---

### ✅ **Fix 4: Use Consistent TTLs (No Conflicting Multipliers)**

**File:** `server/routes/reporting-stream.js` (line 177)

**Before:**
```javascript
const stabilityMultiplier = isHeavyDataset ? (isCollectedTimeOrPoid ? 4 : 3) : 2;
const extendedTtl = baseTtl * stabilityMultiplier;
```

**After:**
```javascript
// Use base TTL directly - no multipliers that cause unpredictable behavior
// Heavy datasets already have longer TTLs in DATASET_TTL config
const ttl = baseTtl;
```

**Impact:**
- ✅ Removes confusing multiplier logic (was: 2x, 3x, or 4x)
- ✅ All TTLs now come directly from `DATASET_TTL` config
- ✅ Easier to adjust: change `DATASET_TTL.recoveredFees` and that's it

---

### ✅ **Fix 5: Remove Unused Background Refresh Markers**

**File:** `server/routes/reporting-stream.js` (removed lines 177-180)

**Before:**
```javascript
if (isCollectedTimeOrPoid) {
  const refreshKey = `${cacheKey}:refresh_marker`;
  const refreshTtl = Math.floor(extendedTtl * 0.8);
  await redisClient.setEx(refreshKey, refreshTtl, 'ready_for_refresh');
  console.log(`🔄 Background refresh marker set for ${datasetName}`);
}
```

**After:**
*Removed entirely - this was dead code never read by anything*

**Impact:**
- ✅ Cleaner code, less Redis clutter
- ✅ No wasted storage on unused keys
- ✅ Honest: if we want background refresh, we need a proper job system

---

### ✅ **Fix 6: Extend Session Recovery Window**

**File:** `src/tabs/Reporting/ReportingHome.tsx` (line 1633)

**Before:**
```javascript
const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
if (snap && hadStream && snap.isComplete === false && snap.ts > twoMinutesAgo && !isStreamingConnected) {
```

**After:**
```javascript
// Extended window gives users time to navigate back if browser was briefly inactive
const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
if (snap && hadStream && snap.isComplete === false && snap.ts > tenMinutesAgo && !isStreamingConnected) {
```

**Impact:**
- ✅ Recovery window: 2 minutes → **10 minutes**
- ✅ Users have time to navigate back without data loss
- ✅ Matches typical report browsing patterns

---

## Current Cache TTLs (After Fixes)

These are the actual TTLs that data will use (no multipliers):

| Dataset | TTL | Purpose |
|---------|-----|---------|
| `userData` | 30 min | User profile, changes rarely |
| `teamData` | 1 hour | Team members, very stable |
| `enquiries` | 30 min | Enquiry list, moderate updates |
| `allMatters` | 30 min | Matters, moderate updates |
| `wip` | 4 hours | WIP total, stable |
| `recoveredFees` | 8 hours | Collected time, very heavy query |
| `poidData` | 6 hours | ID submissions, static once created |
| `wipClioCurrentWeek` | 30 min | Current week WIP, variable |
| `wipDbLastWeek` | 2 hours | Last week WIP, stable |
| `googleAnalytics` | 1 hour | Analytics, updates hourly |
| `googleAds` | 1 hour | Ads spend, updates regularly |
| `metaMetrics` | 1 hour | Meta metrics, regular updates |
| `deals` | 30 min | Pitches/deals, variable |
| `instructions` | 30 min | Instructions, variable |

---

## Expected Behavior After Fixes

### Before (Buggy):
```
12:00 - User fetches reports → recoveredFees TTL set to 8h
12:30 - User refreshes → cache HIT, TTL extended to 24h
13:00 - User refreshes → cache HIT, TTL extended to 24h again
20:00 - User refreshes → cache HIT, TTL extended to 24h AGAIN
        ⚠️ Data is 8 hours old but keeps refreshing TTL
```

### After (Fixed):
```
12:00 - User fetches reports → recoveredFees cached with TTL=8h (expires at 20:00)
12:30 - User refreshes → cache HIT, TTL unchanged (still expires at 20:00)
13:00 - User refreshes → cache HIT, TTL unchanged (still expires at 20:00)
20:00 - Cache expires automatically
20:01 - User refreshes → cache MISS, fresh fetch from database
20:01 - Data cached again with new 8h TTL (expires at 04:00)
```

---

## Logging Changes

### Cache Write (Fresh Data):
```
📋 Dataset recoveredFees cached (TTL: 28800s, expires at 2025-10-22T20:00:00Z)
```

### Cache Hit (Reused Data):
```
📋 Dataset recoveredFees cache hit (Redis) in 45ms - data age: 120s
```

### Data Expiration:
```
🚀 Fetching recoveredFees from source (timeout: 900000ms, heavy: true, collected/poid: true) - cache miss
```

Now you can **see exactly when data was cached and when it expires**!

---

## Testing the Fixes

### 1. Check Cache Stability
Look at server logs:
- Fetch reports at 12:00 → note expiration time
- Keep refreshing every 10 minutes
- ✅ Expiration time should NOT change
- ✅ After TTL expires, should see fresh fetch

### 2. Check Data Age Logging
Refresh reports multiple times:
```
📋 Dataset recoveredFees cache hit (Redis) in 45ms - data age: 10s
📋 Dataset recoveredFees cache hit (Redis) in 42ms - data age: 35s
📋 Dataset recoveredFees cache hit (Redis) in 41ms - data age: 62s
```
✅ Age should increase gradually until TTL expires

### 3. Check Session Recovery
- Start reports fetch
- Interrupt browser/close tab within 10 minutes
- Return to tab
- ✅ Should resume streaming automatically
- ❌ Should NOT resume if >10 minutes have passed

### 4. Check PPC Income
Navigate to PPC Report:
- ✅ Should see full income totals (from earlier TOP 50000 fix)
- ✅ Income should be consistent across refreshes
- ❌ Income should NOT change unless cache expires

---

## Summary of Improvements

| Issue | Before | After |
|-------|--------|-------|
| **TTL Stability** | Extends indefinitely | Fixed duration |
| **Data Staleness** | Unpredictable | Predictable |
| **Cache Age Logging** | None | Shows in logs |
| **TTL Multipliers** | Conflicting (2x/3x/4x) | Consistent (1x) |
| **Recovery Window** | 2 minutes | 10 minutes |
| **Timestamp in Data** | None | Included |
| **Expired Markers** | Never read | Removed |
| **Predictability** | 🔴 Low | 🟢 High |

✅ **Caching is now stable and predictable!**
