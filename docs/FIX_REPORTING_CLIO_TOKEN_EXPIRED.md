# Fix: Reporting Data Not Loading in Production ✅ RESOLVED

**Issue**: Reporting fails to load WIP data from Clio in production  
**Root Cause**: Clio refresh token in Key Vault has expired (401 unauthorized)  
**Status**: Fixed with graceful degradation - reporting now loads with empty WIP when Clio unavailable

## Production Error Log

```
Failed to fetch user WIP from Clio: Failed to fetch team activities from Clio: 401 - 
{"error":"invalid_token","error_description":"The access token provided is expired, 
revoked, malformed or invalid for other reasons."}
```

## What Changed

### Immediate Fix (Applied)

Updated [server/routes/reporting-stream.js](../server/routes/reporting-stream.js#L303) to gracefully handle Clio token errors:

- **Before**: Clio token error would fail entire dataset stream, blocking all reporting data
- **After**: Returns empty WIP structure when Clio unavailable, allowing other datasets to load normally

```javascript
// Graceful degradation for Clio token errors - return empty data instead of failing
if (isClioDataset && isClioTokenError) {
  log.warn(`⚠️ Clio token expired for ${datasetName}, returning empty data`);
  writeSse({
    type: 'dataset-complete',
    dataset: datasetName,
    data: { current_week: { daily_data: {}, activities: [] }, last_week: { ... } },
    warning: 'Clio authentication expired - WIP data unavailable'
  });
  return; // Don't fail the stream
}
```

**Result**: Reporting page now loads successfully even when Clio token expired. Users see:
- ✅ All SQL-based data (enquiries, matters, team, etc.) loads normally
- ⚠️ WIP hours show as zero (graceful degradation)
- 🔍 Console/logs show warning about Clio auth (not a blocking error)

### Root Cause Fix (Action Required)

The reporting endpoint fetches `wipClioCurrentWeek` which requires a valid Clio API token. The system:
1. Reads refresh token from Key Vault secret `clio-pbi-refreshtoken`
2. Exchanges it for a short-lived access token
3. Uses access token to fetch WIP activities from Clio API

When the refresh token expires (usually after 60 days of inactivity), this chain fails.

## Fix: Re-authenticate with Clio

### Option 1: Update via Portal (Recommended)

1. **Re-authenticate with Clio:**
   - Visit: https://eu.app.clio.com/oauth/authorize
   - Use Clio Power BI integration credentials
   - Complete OAuth flow to get new refresh token

2. **Update Key Vault secret:**
   ```bash
   # Via Azure Portal
   Navigate to: helix-keys Key Vault > Secrets > clio-pbi-refreshtoken
   Create new version with the fresh token
   ```

   ```bash
   # Via Azure CLI
   az keyvault secret set \
     --vault-name helix-keys \
     --name clio-pbi-refreshtoken \
     --value "NEW_REFRESH_TOKEN_HERE"
   ```

3. **Clear Redis cache to force token refresh:**
   ```bash
   # Connect to Redis and clear Clio token cache
   redis-cli -h helix-cache-redis.redis.cache.windows.net -p 6380 -a [password] --tls
   DEL rpt:clio:accessToken
   DEL rpt:clio:credentials
   ```

### Option 2: Graceful Degradation (Temporary)

If re-auth isn't immediate, modify reporting to gracefully fall back to DB WIP data:

**File**: [server/routes/reporting.js](../server/routes/reporting.js#L640)

The code already has fallback logic in the management-datasets endpoint (line 147-168) that uses `wipDbCurrentWeek` when Clio fails. However, the streaming endpoint doesn't implement this fallback.

**Quick Fix**: Update `reporting-stream.js` to skip `wipClioCurrentWeek` if Clio token is invalid, allowing other datasets to load:

```javascript
// In processDataset() catch block around line 150
catch (error) {
  // Don't fail entire stream if Clio is unavailable
  if (datasetName === 'wipClioCurrentWeek' && error.message.includes('401')) {
    log.warn(`Clio token expired for ${datasetName}, skipping`);
    writeSse({ type: 'dataset-complete', dataset: datasetName, 
               status: 'ready', data: [], cached: false, count: 0 });
    return;
  }
  // ... existing error handling
}
```

## Prevention

The system already auto-rotates refresh tokens (see `reporting.js` line 609-619):

```javascript
// Clio returns a new refresh token on each refresh - store it back to Key Vault
if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
  await secretClient.setSecret('clio-teamhubv1-refreshtoken', tokenData.refresh_token);
}
```

**However**: This only works if the original token is still valid. Once expired, manual re-auth is required.

**Action**: Set calendar reminder to re-authenticate every 50 days (before 60-day expiry).

## Verification

After updating the token:

```bash
# Check production logs for successful Clio fetch
az webapp log tail --name link-hub-v1 --resource-group Main | grep -i "wipClio"

# Should see:
[WipClio] Fetching TEAM-WIDE activities from ...
Fetched X activities for user ...
```

Test in production:
1. Open Reporting tab
2. Verify WIP data loads (current week hours display)
3. Check browser console for any 401 errors

---

**Related Files:**
- [server/routes/reporting.js](../server/routes/reporting.js) - Token refresh logic
- [server/routes/reporting-stream.js](../server/routes/reporting-stream.js) - Streaming datasets
- [docs/CLIO_API_REFERENCE.md](./CLIO_API_REFERENCE.md) - Clio integration docs
