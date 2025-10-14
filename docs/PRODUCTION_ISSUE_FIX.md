# Production Issues & Fix - October 3, 2025

## Issues Identified in Production Logs

### 1. ❌ 404 Error on `/api/transactions` Route
**Symptom:**
```
GET /api/transactions ... 404 0 0 661
```

**Error Details:**
- Physical Path: `C:\home\site\wwwroot\server.js`
- IIS Error: "The resource you are looking for has been removed, had its name changed, or is temporarily unavailable"

### 2. ⚠️ User Context Middleware Not Working
**Symptom:**
```
[POID][undefined] User Unknown user fetching POID entries since 2019-10-03
[POID][undefined] Retrieved 583 POID entries for user Unknown
```

**Problems:**
- `req.requestId` is `undefined` (should be generated ID like `1728000000-abc123`)
- `req.user` is not populated (showing "Unknown user" instead of actual user details)
- Missing session initiation logs (the formatted box we created)

## Root Cause Analysis

### The Deployment Script Was Missing the Middleware Directory!

**Location**: `build-and-deploy.ps1` line 42-47

**What was being copied:**
```powershell
Copy-Item -Path "server\routes" -Destination "$deployDir\routes" -Recurse -Force
Copy-Item -Path "server\utils" -Destination "$deployDir\utils" -Recurse -Force
```

**What was missing:**
```powershell
Copy-Item -Path "server\middleware" -Destination "$deployDir\middleware" -Recurse -Force
```

This means:
- ✅ `server/routes/transactions.js` was being copied
- ❌ `server/middleware/userContext.js` was **NOT** being copied
- 💥 Server failed to start properly because `require('./middleware/userContext')` couldn't find the file
- 💥 Routes returning 404 because Express couldn't initialize properly

## The Fix

### Updated `build-and-deploy.ps1` (Line 46)

**Before:**
```powershell
Copy-Item -Path "server\routes" -Destination "$deployDir\routes" -Recurse -Force
Copy-Item -Path "server\utils" -Destination "$deployDir\utils" -Recurse -Force
Copy-Item -Path "server\web.config" -Destination "$deployDir\web.config" -Force
```

**After:**
```powershell
Copy-Item -Path "server\routes" -Destination "$deployDir\routes" -Recurse -Force
Copy-Item -Path "server\middleware" -Destination "$deployDir\middleware" -Recurse -Force
Copy-Item -Path "server\utils" -Destination "$deployDir\utils" -Recurse -Force
Copy-Item -Path "server\web.config" -Destination "$deployDir\web.config" -Force
```

## What Will Be Fixed After Redeployment

### 1. `/api/transactions` Route Will Work ✅
- Route properly registered in `server/index.js` (line 162)
- File exists at `server/routes/transactions.js`
- Will now be deployed to production

### 2. User Context Middleware Will Activate ✅
- Middleware file deployed: `server/middleware/userContext.js`
- Will be loaded by `server/index.js` (line 62)
- Will execute before all API routes (line 107)

### 3. Enhanced Logging Will Appear ✅
**Instead of this:**
```
[POID][undefined] User Unknown user fetching POID entries since 2019-10-03
```

**You'll see:**
```
┌─────────────────────────────────────────────────────────────
│ 🔐 REQUEST [1728000000-abc123def]
│ User: Lukasz Zemanek (LZ) <lz@helix-law.com>
│ Action: GET /api/poid/6years
│ IP: 89.238.24.75
│ Entra ID: f46fed2c-0775-49a7-9fb4-721b813c84ff
│ Clio ID: 142961
│ Role: Fee Earner
└─────────────────────────────────────────────────────────────
[POID][1728000000-abc123def] User LZ (Lukasz Zemanek) fetching POID entries since 2019-10-03
✅ RESPONSE [1728000000-abc123def] 200 | 703ms | User: LZ
```

## Deployment Steps

1. **Run the fixed deployment script:**
   ```powershell
   .\build-and-deploy.ps1
   ```

2. **Wait for Azure deployment** (~2-3 minutes)

3. **Verify in production logs:**
   - ✅ Session boxes appear with user details
   - ✅ Request IDs in all route logs
   - ✅ `/api/transactions` returns 200 instead of 404
   - ✅ "Unknown user" replaced with actual names

4. **Monitor Azure Portal:**
   ```
   az webapp log tail --name link-hub-v1 --resource-group Main
   ```

## Files Changed

- ✅ `build-and-deploy.ps1` - Added middleware directory to deployment
- ✅ Already created: `server/middleware/userContext.js`
- ✅ Already created: `server/routes/transactions.js`
- ✅ Already updated: `server/index.js` (middleware + routes registered)

## Next Steps After Deployment

### Immediate Verification (5 minutes)
1. Open Teams app
2. Check browser console - should see no 404 errors
3. Check Azure logs - should see formatted session boxes

### Monitor for Issues (1 hour)
1. Watch for any middleware errors
2. Verify user lookups working (check "Using cached user" logs)
3. Confirm transactions data loads properly
4. Check response times (should see timing in logs)

### Performance Baseline (24 hours)
1. Monitor slow request warnings (>3s)
2. Check cache hit rate for user lookups
3. Verify connection pooling metrics
4. Review any error patterns

## Prevention: Deployment Checklist

Add this checklist to future deployments:

```powershell
# Before running build-and-deploy.ps1, verify:
# ✅ All server subdirectories in copy commands (routes, middleware, utils)
# ✅ New files added to any server/ subdirectories
# ✅ Any new dependencies in server/package.json
# ✅ Environment variables set in Azure App Settings
# ✅ Test locally with npm run dev before deploying
```

---

**Status**: Ready to redeploy 🚀
**Impact**: High - fixes user tracking and transactions endpoint
**Risk**: Low - only adding missing files, no code changes
**Rollback**: Redeploy previous version if needed (last-deploy.zip)
