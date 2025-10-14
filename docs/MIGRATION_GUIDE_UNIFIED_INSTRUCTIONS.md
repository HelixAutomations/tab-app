# Migration Guide: Instructions Tab Unified Architecture

## What Changed (September 2025)

The instructions tab has been migrated from a fragmented, multi-call architecture to a unified single-endpoint approach to fix "patchy" loading behavior.

## Before vs After

### Before: Fragmented Architecture ❌
```typescript
// Multiple separate API calls
const instructions = await fetchInstructions(userInitials);
const deals = await fetchDeals(userInitials); 
const documents = await fetchDocuments(userInitials);
const idVerifications = await fetchIDVerifications(userInitials);

// Complex client-side merging and transformation
const mergedData = useMemo(() => {
  return instructions.map(inst => ({
    ...inst,
    deals: deals.filter(d => d.InstructionRef === inst.InstructionRef),
    documents: documents.filter(d => d.InstructionRef === inst.InstructionRef),
    // ... complex merging logic
  }));
}, [instructions, deals, documents]);
```

**Problems:**
- N+1 query problems
- Race conditions between API calls
- Luke Test instruction sometimes missing
- Complex client-side data transformation
- Poor performance due to multiple round trips

### After: Unified Architecture ✅
```typescript
// Single API call
const response = await fetch('/api/instructions?includeAll=true');
const data = await response.json();

// Clean, pre-structured data
const instructionData = data.instructions; // Already includes all relationships
```

**Benefits:**
- Single database query with JOINs
- Consistent data loading
- Luke Test instruction always visible
- Server-side business logic
- Better performance

## Key Files Modified

### 1. Frontend: `src/app/App.tsx`
**Changed:** Environment-driven data source selection
```typescript
// NEW: Environment variable takes precedence
const useLocalData =
  process.env.REACT_APP_USE_LOCAL_DATA === "true" ||
  (process.env.REACT_APP_USE_LOCAL_DATA !== "false" && window.location.hostname === "localhost");
```

### 2. Backend: `server/routes/instructions.js` 
**Added:** Unified instruction endpoint that proxies to VNet functions
```typescript
router.get('/', async (req, res) => {
  // Get function code from env or Key Vault
  let functionCode = process.env.INSTRUCTIONS_FUNC_CODE;
  if (!functionCode) {
    functionCode = await getSecret('fetchInstructionData-code');
  }
  
  // Call VNet function
  const response = await fetch(`${baseUrl}?code=${functionCode}&${params}`);
  const data = await response.json();
  
  // Return structured data
  res.json(transformedData);
});
```

### 3. Environment: `.env`
**Added:** Production data configuration
```env
REACT_APP_USE_LOCAL_DATA=false
INSTRUCTIONS_FUNC_CODE=<your-azure-function-key>
```

## API Changes

### New Unified Endpoint
```
GET /api/instructions?includeAll=true
```

**Response:**
```json
{
  "deals": [...],
  "instructions": [...], 
  "documents": [...],
  "idVerifications": [...],
  "count": 201,
  "computedServerSide": true,
  "requestId": "abc123",
  "timestamp": "2025-09-04T18:20:25.651Z"
}
```

### Deprecated (But Still Available)
- Individual instruction data endpoints
- Client-side data merging utilities  
- Complex useMemo transformations

## Environment Configuration

### Production Data Access
```env
REACT_APP_USE_LOCAL_DATA=false  # Forces production data
INSTRUCTIONS_FUNC_CODE=<current-code>  # VNet function authentication
KEY_VAULT_URL=https://helix-keys.vault.azure.net/
```

### Local Development
```env
REACT_APP_USE_LOCAL_DATA=true   # Uses local test data
```

## Common Issues & Solutions

### Issue: Luke Test Missing
**Symptom:** Luke Test instruction (HLX-27367-94842) not appearing
**Cause:** Using local test data instead of production data
**Fix:** 
```bash
# Set environment variable
echo "REACT_APP_USE_LOCAL_DATA=false" >> .env

# Restart all Node processes
taskkill /F /IM node.exe
npm run dev:all
```

### Issue: 401 Authentication Error
**Symptom:** `/api/instructions` returns 401 error
**Cause:** Expired VNet function code
**Fix:**
```bash
# Test function code directly
curl "https://instructions-vnet-functions.azurewebsites.net/api/fetchInstructionData?code=<YOUR_CODE>"

# Get new code from Azure Portal if expired
# Update INSTRUCTIONS_FUNC_CODE in .env
```

### Issue: Environment Variables Not Loading
**Symptom:** Still using local data after setting `REACT_APP_USE_LOCAL_DATA=false`
**Cause:** Node processes using cached environment
**Fix:**
```bash
# Force complete restart
taskkill /F /IM node.exe
npm run dev:all
```

## Testing the Migration

### 1. Check Environment Loading
Browser console should show:
```
🔵 Fetching instruction data from unified server endpoint
🌐 Calling unified endpoint: /api/instructions?includeAll=true
```

### 2. Verify Production Data Access
Console should show:
```
✅ Received clean instruction data: {count: 201, computedServerSide: true}
🔍 Debug: Luke Test found in instructions: true
```

### 3. Test API Directly
```bash
curl http://localhost:8080/api/instructions?includeAll=true
# Should return 200 with instruction data
```

## Future Development Guidelines

### For Instruction-Related Work
- Use `/api/instructions` endpoint for all instruction data access
- Avoid creating new individual API calls
- Server-side business logic preferred over client-side transformation

### For Other Data Types  
- Consider applying unified pattern to enquiries, matters, etc.
- Pattern established can be replicated for other complex data relationships

### VNet Function Development
- All database access must go through VNet-enabled functions
- Local development cannot directly access production database
- Function codes require periodic rotation

## Rollback Plan (If Needed)

To revert to previous architecture:
1. Set `REACT_APP_USE_LOCAL_DATA=true` 
2. Comment out unified endpoint calls in `App.tsx`
3. Uncomment legacy individual API calls
4. Restart application

However, this would reintroduce the "patchy" loading behavior and Luke Test inconsistency issues.

## Documentation References

- `docs/UNIFIED_INSTRUCTIONS_ENDPOINT.md` - Detailed API specs
- `ARCHITECTURE_ANALYSIS.md` - Complete architecture overview  
- `LOCAL_DEVELOPMENT_SETUP.md` - Environment setup guide
- `.env` - Environment configuration
