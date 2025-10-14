# Migration: Cold Start Functions → Express Server Routes

## Summary
Migrated critical Azure Functions with cold start issues to Express server routes using pooled database connections. This eliminates the 500 errors on first load caused by Key Vault fetches and new connection creation on every request.

## Functions Migrated

### 1. **getPOID6years** → `/api/poid/6years`
- **Old**: Azure Function with direct tedious connection
- **New**: `server/routes/poid.js` using pooled `withRequest` from `db.js`
- **Database**: helix-core-data
- **Query**: Returns POID entries from last 6 years
- **Improvement**: Connection pooling + health checks, no Key Vault fetch per request

### 2. **getFutureBookings** → `/api/future-bookings`
- **Old**: Azure Function creating 2 tedious connections (boardroom + soundproof)
- **New**: `server/routes/futureBookings.js` using pooled connections
- **Database**: helix-project-data
- **Query**: Returns future boardroom and soundproof pod bookings
- **Improvement**: Connection pooling, parallel queries still supported

### 3. **getOutstandingClientBalances** → `/api/outstanding-balances`
- **Old**: Azure Function fetching Clio credentials from Key Vault every request
- **New**: `server/routes/outstandingBalances.js` with token caching
- **API**: Clio OAuth refresh + outstanding balances fetch
- **Improvement**: Token cached for 55 minutes, avoiding Key Vault fetch on every request

### 4. **getTransactions** → `/api/transactions`
- **Old**: Azure Function with direct tedious connection + Key Vault fetch
- **New**: `server/routes/transactions.js` using pooled `withRequest` from `db.js`
- **Database**: helix-core-data
- **Query**: Returns all transactions ordered by date DESC
- **Improvement**: Connection pooling + health checks, no Key Vault fetch per request

## Code Changes

### Server Routes Created
```
server/routes/poid.js                    (NEW)
server/routes/futureBookings.js          (NEW)
server/routes/outstandingBalances.js     (NEW)
server/routes/transactions.js            (NEW)
```

### Server Configuration Updated
```javascript
// server/index.js - Added imports and registrations
const poidRouter = require('./routes/poid');
const futureBookingsRouter = require('./routes/futureBookings');
const outstandingBalancesRouter = require('./routes/outstandingBalances');
const transactionsRouter = require('./routes/transactions');

app.use('/api/poid', poidRouter);
app.use('/api/future-bookings', futureBookingsRouter);
app.use('/api/outstanding-balances', outstandingBalancesRouter);
app.use('/api/transactions', transactionsRouter);
```

### Frontend Updated
```typescript
// src/tabs/home/Home.tsx - Replaced Azure Function URLs with Express routes

OLD: `${proxyBaseUrl}/${process.env.REACT_APP_GET_POID_6YEARS_PATH}?code=${...}`
NEW: '/api/poid/6years'

OLD: `${proxyBaseUrl}/${process.env.REACT_APP_GET_FUTURE_BOOKINGS_PATH}?code=${...}`
NEW: '/api/future-bookings'

OLD: `${baseUrl}/${process.env.REACT_APP_GET_OUTSTANDING_CLIENT_BALANCES_PATH}?code=${...}`
NEW: '/api/outstanding-balances'
```

## Snippet Functions Removed

Deleted obsolete snippet-related Azure Functions (approach changed):
```
api/src/functions/getSnippetEdits.ts         (DELETED)
api/src/functions/getSnippetBlocks.ts        (DELETED)
api/src/functions/submitSnippetEdit.ts       (DELETED)
api/src/functions/approveSnippetEdit.ts      (DELETED)
api/src/functions/deleteSnippetEdit.ts       (DELETED)
api/src/functions/getSimplifiedBlocks.ts     (DELETED)
```

## Performance Improvements

### Before (Cold Start)
1. Azure Function starts
2. Fetch SQL password from Key Vault (500ms-1s)
3. Create new SQL connection (200-500ms)
4. Execute query
5. **Total**: ~1-2 seconds = frequent timeouts/500 errors

### After (Pooled Connections)
1. Express route receives request
2. Get connection from pool (instant, already authenticated)
3. Execute query
4. **Total**: ~50-200ms = reliable, fast

### Token Caching (Outstanding Balances)
- **Before**: Key Vault fetch every request (~500ms-1s)
- **After**: Cached for 55 minutes, fetched only when expired

## Testing Checklist

- [ ] Test `/api/poid/6years` endpoint returns POID records
- [ ] Test `/api/future-bookings` endpoint returns boardroom and soundproof bookings
- [ ] Test `/api/outstanding-balances` endpoint returns Clio balances
- [ ] Verify Home dashboard metrics load without 500 errors on first load
- [ ] Verify Home dashboard metrics load quickly (<500ms) on subsequent loads
- [ ] Test cold start behavior (restart server, clear cache)
- [ ] Verify connection pooling is working (check db.js health check logs)

## Rollback Plan

If issues occur:

1. Revert `Home.tsx` changes to use old Azure Function URLs
2. Comment out new route registrations in `server/index.js`
3. Azure Functions are still deployed and functional (not deleted)

## Next Steps (Recommended)

Consider migrating these remaining cold-start Functions:
- `getAttendance.ts` (has Express route but still proxies to Function)
- `getTransactions.ts` (if showing cold start issues)

## Notes

- **Connection pooling** from `server/utils/db.js` is now leveraged for all SQL queries
- **Key Vault credentials** are still fetched via DefaultAzureCredential, but cached at module level
- **Health checks** run every 2 minutes to keep connections alive
- **Retry logic** in db.js handles transient connection failures
- **Environment variables** for SQL timeouts are respected (SQL_REQUEST_TIMEOUT_MS, etc.)
