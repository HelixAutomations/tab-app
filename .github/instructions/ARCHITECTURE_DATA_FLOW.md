# Architecture & Data Flow

## Overview
This document describes the high-level architecture, data flows, and key integration points in the Helix Hub application, with focus on the Instructions and Matter Management system.

---

## Technology Stack

### Frontend
- **Framework**: React with TypeScript
- **UI Library**: Fluent UI React (Microsoft Teams UI components)
- **State Management**: React hooks (useState, useEffect, useContext)
- **Routing**: React Router
- **Authentication**: Microsoft Teams SSO

### Backend
- **Runtime**: Node.js
- **Framework**: Azure Functions (v4, @azure/functions)
- **Database**: Azure SQL Database (mssql package)
- **API Integration**: Clio API v4 (REST)
- **Secrets**: Azure Key Vault (@azure/keyvault-secrets)

### Infrastructure
- **Hosting**: Azure App Service (frontend), Azure Functions (backend)
- **Database**: Azure SQL Database
- **Storage**: Azure Blob Storage (Azurite for local dev)
- **Identity**: Microsoft Entra ID (Azure AD)

---

## Application Structure

```
helix-hub-v1/
├── src/                          # Frontend React application
│   ├── tabs/                     # Teams tab components
│   │   ├── instructions/         # Instructions management UI
│   │   │   ├── InstructionsTable.tsx
│   │   │   ├── MatterOperations.tsx
│   │   │   └── InstructionDetails.tsx
│   │   └── dashboard/            # Analytics dashboard
│   ├── components/               # Shared UI components
│   ├── utils/                    # Utilities
│   │   └── matterNormalization.ts
│   └── contexts/                 # React contexts
│
├── api/                          # Azure Functions backend
│   └── src/                      # Function handlers
│       ├── fetchInstructionData.ts
│       ├── fetchMattersData.ts
│       └── (other functions)
│
├── server/                       # Local dev server
│   └── routes/
│       ├── instructions.js       # Instructions CRUD
│       └── matter-operations.js  # Matter management
│
├── tools/                        # Reusable ops scripts (tracked)
├── scripts/                      # Local-only scratch (excluded from git)
│   └── backfill-instruction-matters.js
│
├── database/                     # Database schemas
│   └── migrations/
│
└── docs/                         # Documentation
```

---

## Data Flow: Instructions & Matters

### 1. Instruction Submission (Initial Creation)

```
User Submits Form (Teams Tab)
    ↓
Frontend validates input
    ↓
POST /api/insertEnquiry (Azure Function)
    ↓
INSERT INTO Instructions
  - InstructionRef generated
  - Stage = 'initialised'
  - ClientId = NULL
  - MatterId = NULL
    ↓
INSERT INTO Matters (placeholder)
  - MatterID = GUID
  - Status = 'MatterRequest'
  - DisplayNumber = NULL
    ↓
Return InstructionRef to frontend
```

**Key Point**: At this stage, NO Clio integration has occurred yet.

---

### 2. Matter Opening Workflow (Full Path)

```
User Opens Instruction Details
    ↓
User clicks "Open Matter" in MatterOperations panel
    ↓
Frontend: MatterOperations.tsx
  - Collects matter details (description, practice area, etc.)
    ↓
POST /api/matter-operations (Azure Function)
  - Action: 'create-matter'
    ↓
Backend: server/routes/matter-operations.js
  1. Get Clio credentials from Key Vault (by HelixContact initials)
  2. Refresh Clio access token
  3. Search for existing Clio client by email
     - If found: Use existing ClientId
     - If not found: Create new Clio contact → Get ClientId
  4. Create Clio matter → Get MatterId & DisplayNumber
  5. UPDATE Instructions SET ClientId, MatterId
  6. UPDATE Matters SET MatterID, DisplayNumber, ClientID, Status='Open'
    ↓
Return matter details to frontend
    ↓
Frontend refreshes instruction data
  - instruction.matters[] now populated with real Clio matter
```

**Key Point**: This is the ONLY path that populates ClientId/MatterId in normal operation.

---

### 3. Instructions Table Display

```
User opens Instructions tab
    ↓
Frontend: InstructionsTable.tsx
  - useEffect → fetchInstructions()
    ↓
GET /api/fetchInstructionData (Azure Function)
    ↓
Backend: server/routes/instructions.js
  - Query: SELECT i.*, m.* FROM Instructions i
          LEFT JOIN Matters m ON i.InstructionRef = m.InstructionRef
  - Groups matters by InstructionRef
  - Returns: instruction.matters[] array
    ↓
Frontend receives instruction data
  - If instruction.matters[] contains items with DisplayNumber:
    → Shows matter chip/badge
  - If instruction.matters[] is empty or only placeholders:
    → Shows "No matter" state
```

**Critical Join**:
```sql
LEFT JOIN Matters m ON i.InstructionRef = m.InstructionRef
```
This join returns ALL Matters records for an instruction, including:
- Real Clio matters (Status='Open', has DisplayNumber)
- Placeholder records (Status='MatterRequest', no DisplayNumber)

**Frontend Filtering**: `MatterOperations.tsx` and `InstructionsTable.tsx` filter out placeholder records by checking for presence of `DisplayNumber`.

---

### 4. Matter Operations Panel

```
User clicks instruction row
    ↓
InstructionDetails.tsx opens
  - Contains <MatterOperations /> component
    ↓
MatterOperations.tsx
  - Displays linked matters from instruction.matters[]
  - Shows "Open Matter" button if no valid matter exists
  - Allows editing matter details
  - Links to Clio web app for full management
```

**Clio Web Link Pattern**:
```
https://eu.app.clio.com/nc/#/matters/{matterId}
```

---

## Redundant Code & Cleanup Opportunities

### 1. Duplicate Matter Records

**Problem**: Instructions can have multiple placeholder records in Matters table with Status='MatterRequest'.

**Root Cause**: 
- Initial workflow creates placeholder on instruction submission
- If matter opening fails/is abandoned, placeholder remains
- Multiple workflow attempts create multiple placeholders

**Solution Implemented**: Backfill script deletes duplicate placeholders:
```javascript
// Update first placeholder
UPDATE Matters 
SET MatterID = ?, DisplayNumber = ?, ClientID = ?, Status = 'Open', ...
WHERE InstructionRef = ? AND Status = 'MatterRequest'

// Delete additional placeholders
DELETE FROM Matters 
WHERE InstructionRef = ? AND Status = 'MatterRequest'
```

**Recommendation**: Add UNIQUE constraint on `(InstructionRef, Status)` where Status='MatterRequest' to prevent future duplicates.

---

### 2. Legacy Schema Handling

**Problem**: Code contains references to both legacy (spaced keys) and new (PascalCase) schema:

```javascript
// Legacy
matter["Display Number"]
matter["Unique ID"]

// New
matter.DisplayNumber
matter.MatterID
```

**Current State**: Database uses new schema (PascalCase).

**Cleanup Opportunity**:
- Search codebase for legacy schema references: `grep -r '"Display Number"'`
- Update to use new schema consistently
- Remove `matterNormalization.ts` if no longer needed

---

### 3. Unused Placeholder Records

**Problem**: Many Instructions have placeholder Matter records that will never be used (instruction abandoned, matter already opened elsewhere, etc.).

**Identification Query**:
```sql
SELECT m.MatterID, m.InstructionRef, i.Stage, i.LastUpdated
FROM Matters m
JOIN Instructions i ON m.InstructionRef = i.InstructionRef
WHERE m.Status = 'MatterRequest'
  AND i.ClientId IS NOT NULL  -- Matter already opened
ORDER BY i.LastUpdated DESC
```

**Cleanup Strategy**:
- Delete placeholders where `Instructions.ClientId IS NOT NULL` (matter already opened)
- Delete placeholders for instructions older than X days with Stage='initialised' (abandoned)

---

### 4. Backfill Operations

Backfill operations are not tracked as one-off scripts. If needed, implement a reusable tool in `tools/` or a scoped admin route.

---

## Key Integration Points

### 1. Clio API Integration

**Files**:
- `server/routes/matter-operations.js` - Main Clio operations

**Critical Dependencies**:
- Azure Key Vault for per-user Clio credentials
- Refresh token rotation (single-use tokens)
- EU region API endpoint (`eu.app.clio.com`)

**See**: `.github/instructions/CLIO_API_REFERENCE.md`

---

### 2. Azure SQL Database

**Files**:
- `server/routes/instructions.js` - Instructions queries
- `server/routes/matter-operations.js` - Matters queries
- `database/` - Schema definitions

**Connection Pattern**:
```javascript
import sql from 'mssql';

const pool = await sql.connect({
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: { encrypt: true }
});

const result = await pool.request()
  .input('ref', sql.NVarChar(50), instructionRef)
  .query('SELECT * FROM Instructions WHERE InstructionRef = @ref');
```

**See**: `.github/instructions/DATABASE_SCHEMA_REFERENCE.md`

---

### 3. Azure Key Vault

**Files**:
- `server/routes/matter-operations.js`

**Pattern**:
```javascript
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const credential = new DefaultAzureCredential();
const keyVaultUrl = process.env.KEY_VAULT_URL;
const client = new SecretClient(keyVaultUrl, credential);

const secret = await client.getSecret('BOD-clio-v1-refreshtoken');
const refreshToken = secret.value;
```

**Secret Naming Convention**: `{initials}-clio-v1-{credential}`

---

## Performance Considerations

### 1. Database Queries

**Current Approach**: JOIN Instructions + Matters on every fetch
```sql
SELECT i.*, m.* 
FROM Instructions i
LEFT JOIN Matters m ON i.InstructionRef = m.InstructionRef
```

**Performance**: 
- Works well for small datasets (< 1000 instructions)
- Consider pagination/filtering for larger datasets
- Index on `Matters.InstructionRef` recommended

---

### 2. Clio API Calls

**Rate Limits**: 500 requests per 10 seconds

**Optimization Strategies**:
- Cache Clio access tokens (valid for 1 hour)
- Batch operations when possible
- Use webhooks for real-time updates (future enhancement)

---

### 3. Frontend Rendering

**Current Approach**: Load all instructions on mount

**Optimization Opportunities**:
- Implement virtualization for large tables (react-window)
- Add server-side pagination
- Filter/search on backend instead of frontend

---

## Testing Considerations

### Database Testing

**Local Development**:
- Use Azurite for local Azure SQL emulation (if available)
- Alternatively, use separate Azure SQL database for dev

**Test Data**:
- Avoid testing against production database
- Create test instructions with known InstructionRefs
- Clean up test data after tests complete

---

### Clio API Testing

**Challenges**:
- No official Clio sandbox environment
- Requires real credentials for testing

**Strategies**:
- Use dedicated test Clio account
- Mock Clio API responses in unit tests
- Integration tests only in non-production environments

---

## Data Operations & Sync Architecture

### Overview
The Data Centre is the operational control plane for Helix CRM data integrity. It syncs data from Clio (source of truth) into Azure SQL tables for fast local querying, and provides full transparency into what happened, when, by whom, and whether the result is valid.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Data Centre (frontend) | `src/tabs/Reporting/DataCentre.tsx` | Coverage compliance, sync controls, integrity checks |
| Operation Validator | `src/tabs/Reporting/components/OperationValidator.tsx` | Full validation UI inside Custom Sync (`mode="full"`) — confidence strip, metrics, deep-validate, explain |
| Data Operations routes | `server/routes/dataOperations.js` | All sync, explain, sample, ops-log endpoints |
| Scheduler | `server/utils/dataOperationsScheduler.js` | Automated syncs (daily at :03/:33, rolling 7d at 23:03) |

### UI Hierarchy (CRITICAL — reflects operational priority)

The Data Centre layout is **intentionally ordered** by importance to ops users:

1. **Coverage + Audit panel** (primary) — one unified surface. The 24-month checklist grid is now the audit surface as well: each month row includes attributed operation events for that month window (with status/source filters and lane scoping). This avoids duplicated logs and keeps context tied to the coverage window.
2. **Coverage controls** (secondary) — same compliance backbone and auto-sync intelligence: per-month sync, bulk backfill, freshness badges.
3. **Custom Sync + Validation** (tertiary, collapsed by default) — contains `OperationValidator mode="full"` (confidence strip, metrics, deep-validate, explain panel) plus ad-hoc date-range sync controls. Validation tools live here because they relate to custom sync operations. Visually demoted: borderless toggle, smaller text, faint colour.

**Design philosophy**: Coverage context first — audit should live beside the month window it affects. Lane-scoped filters keep only relevant operations visible (dataset type + source + status). Custom Sync + Validation remains the manual override for edge-case debugging and deep verification. The auto-sync policy (`shouldAutoSyncMonth`) handles the intelligence: recent months refresh at 7-day intervals, mid months at 30-day, archive months at 120-day.

### SQL Tables

| Table | Database | Purpose |
|-------|----------|---------|
| `collectedTime` | Core (`SQL_CONNECTION_STRING`) | Clio collected-time line items (payments received) |
| `wip` | Core (`SQL_CONNECTION_STRING`) | Clio unbilled activities (time entries + expenses) |
| `dataOpsLog` | Instructions (`INSTRUCTIONS_SQL_CONNECTION_STRING`) | Audit log for every sync/validation operation |

See `DATABASE_SCHEMA_REFERENCE.md` for full column listings, query patterns, and anti-patterns for each table.

### Sync Pipeline — Collected Time

```
POST /api/data-operations/sync-collected { startDate, endDate }
    ↓
Request Clio report (POST /api/v4/reports.json, kind: invoice_payments_v2)
    ↓
Poll until state === 'completed' (30-60s)
    ↓
Download JSON → array of payment line items
    ↓
DELETE FROM collectedTime WHERE payment_date BETWEEN @start AND @end
    ↓
Batch INSERT (100 rows × 17 cols = 1,700 params)
    ↓
Post-insert dedup CTE: PARTITION BY id, bill_id — keeps one row per unique combination
    ↓
Auto-validate: COUNT(*), COUNT(DISTINCT id), SUM(payment_allocated), kind breakdown
    ↓
Log to dataOpsLog (status: started → completed → validated)
```

**Source API**: Reports API (`invoice_payments_v2`) — async, slow (30-60s report generation)
**Amount column**: `payment_allocated`
**Critical**: `id` is NOT unique per row (split payments). Never dedup by `id` alone — this destroyed £150k of revenue data historically.

### Sync Pipeline — WIP

```
POST /api/data-operations/sync-wip { startDate, endDate }
    ↓
Paginate Clio Activities API (GET /api/v4/activities.json, 200/page)
    ↓
DELETE FROM wip WHERE date BETWEEN @start AND @end
    ↓
Batch INSERT (100 rows × 20 cols = 2,000 params — near SQL Server's 2,100 limit)
    ↓
Fallback: if batch fails, insert individually (one bad row doesn't lose the batch)
    ↓
Post-insert dedup CTE: PARTITION BY id — keeps one row per activity
    ↓
Auto-validate: COUNT(*), SUM(total), SUM(quantity_in_hours), type breakdown (TimeEntry/ExpenseEntry)
    ↓
Log to dataOpsLog (status: started → completed → validated)
```

**Source API**: Activities API (`/activities.json`) — paginated, fast
**Amount column**: `total` (NOT `sub_total` — that's collectedTime)
**ID uniqueness**: `id` IS unique per row, safe to dedup by `id` alone
**Fields requested**: `id,date,created_at,updated_at,type,matter,quantity_in_hours,note,total,price,expense_category,activity_description,user,bill,billed,non_billable`

### Post-Sync Validation Messages

After every sync, auto-validation logs a breakdown in the audit trail:

- **Collected**: `1748 payments · 283 splits · Service £48,662.37 · Expense £43,415.51`
- **WIP**: `2450 activities · 312.5h · TimeEntry £18,200.00 · ExpenseEntry £1,500.00`

### Deep Validate (Cross-Check Against Clio)

Both entities support a "deep validate" that compares SQL row counts against the Clio source:

- **WIP**: Paginates Activities API with `fields=id` to count total activities → compares against SQL `COUNT(*)` + `SUM(total)` + `SUM(hours)` + type breakdown + spot checks
- **Collected**: Generates a fresh Clio report → counts line items → compares against SQL `COUNT(*)` + `SUM(payment_allocated)` + kind breakdown

### Audit Trail
Every sync operation logs:
- **triggeredBy**: `manual` (user clicked) or `scheduler` (automated) or `system` (auto-validation)
- **invokedBy**: user's full name (from `req.user.fullName` via userContext middleware) or `system` for auto-checks
- **status**: `started` → `completed` → `validated` (auto-validation runs after every sync)

### Current-Week Boundary (CRITICAL)

The reporting layer (`server/routes/reporting.js`) splits WIP data sourcing:
- **Historical**: SQL `wip` table — last 24 months **excluding the current ISO week** (Mon–Sun). Uses `getLast24MonthsExcludingCurrentWeek()` to compute the boundary.
- **Current week**: Live from Clio API (`/api/v4/activities.json`). Frontend deduplicates by `id` when merging.
- **Fallback**: If Clio is unavailable, `fetchWipDbCurrentWeek()` reads the current week from SQL instead.

**Implication for Data Hub sync**: When the Coverage Panel syncs the current month for WIP, `syncMonthKey` in `DataCentre.tsx` **caps the end date at last Sunday** to avoid writing current-week data into SQL. This prevents double-counting on the Management Dashboard, which combines SQL historical data with Clio live current-week data.

### Coverage Panel (Month Coverage)

The coverage panel is the **compliance backbone + audit surface** in Data Centre and shows a **checklist-style** 24-month grid powered by `/api/data-operations/month-audit`:

- **Auto-sync to active operation**: Coverage panel always shows the correct operation (collected/WIP) matching the active card. Switching cards refreshes the coverage data.
- **Smart auto-sync policy**: The `shouldAutoSyncMonth` function determines when months need refreshing — recent months (≤2mo) at 7-day intervals, mid-range (≤6mo) at 30 days, archive at 120 days. This means one-click coverage is genuinely smart: it only re-syncs what's stale.
- **Checklist rows**: Each month shows:
  - Left border colour: green (synced), amber (started), red (error), grey (not synced)
  - Status badge: `✓ synced`, `✗ error`, `⏳ started`, or `not synced`
  - Attribution: who synced it and when (e.g. "Luke · 15 Feb · 1,234 rows")
  - For WIP: billable/non-billable row counts with `⚠ check` warning if all entries are billable
  - For Collected: total rows and £ value
  - Current month shows ⚡ indicator when current-week dates are excluded
- **Per-month sync**: Each row has a sync button to fill/re-fill individual months
- **Bulk backfill**: "Sync all uncovered" button processes uncovered months sequentially

### OperationValidator — 3-Layer UI (always visible, top of drilled-in view)
The OperationValidator is always visible when drilled into Collected or WIP — it's the first thing below the breadcrumb. It provides the primary trust signal for the current data.

1. **Confidence Strip** — traffic-light (green/amber/red) answering "Is this number right?" with plain-language explanation. WIP shows "activities" and hours; collected shows "payments" and splits.
2. **Activity Timeline** — open by default, shows every operation with AUTO/USER tags, invoker name, timestamps, `✓ validated` entries. Last sync shows "via Activities API" (WIP) or "via Reports API" (collected).
3. **Explain Panel** — clickable multi-row IDs open inline sample panels showing the actual rows and why they exist (split payments for collected; type breakdown for WIP).

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/data-operations/sync-collected` | Sync collected time from Clio for date range |
| POST | `/api/data-operations/sync-wip` | Sync WIP data from Clio |
| GET | `/api/data-operations/validate?entity=X&start=&end=` | Quick validate (SQL counts/sums) |
| GET | `/api/data-operations/deep-validate?entity=X&start=&end=` | Cross-check SQL against Clio source API |
| GET | `/api/data-operations/monthly-totals?entity=X` | 12-month totals with kind/type breakdown |
| GET | `/api/data-operations/ops-log` | Fetch operation audit log |
| GET | `/api/data-operations/explain` | Full pipeline explanation with sum analysis |
| GET | `/api/data-operations/explain/sample?clioId=X` | Actual rows for a specific Clio line-item ID |

---

## Application Insights Telemetry

### Overview
All server-side processes emit structured telemetry to Azure Application Insights via the `applicationinsights` SDK. Locally (no connection string), calls are no-ops — zero overhead.

**Connection**: Auto-detected from `APPLICATIONINSIGHTS_CONNECTION_STRING` App Service setting. SDK initialised in `server/index.js` before Express, so HTTP requests are auto-instrumented.

### Utility Module
`server/utils/appInsights.js` — lightweight wrapper exposing:
- `trackEvent(name, properties, measurements)` — named lifecycle events
- `trackException(error, properties)` — structured error tracking with context
- `trackMetric(name, value, properties)` — numeric measurements (duration, row counts)
- `trackDependency(target, name, duration, success, properties)` — external calls (Clio, SQL)
- `flush()` — called on SIGTERM/SIGINT for graceful shutdown

### Event Naming Convention
All events follow `Component.Entity.Lifecycle` pattern:
```
DataOps.CollectedTime.Started
DataOps.CollectedTime.Completed
DataOps.CollectedTime.Validated
DataOps.CollectedTime.Failed
DataOps.Wip.Started
DataOps.Wip.Completed
DataOps.Wip.Validated
DataOps.Wip.Failed
Scheduler.Started
Scheduler.Collected.Hot.Completed
Scheduler.Collected.Hot.Failed
Scheduler.Collected.Warm.Completed
Scheduler.Wip.Cold.Failed
MatterOpening.Opponents.Completed
MatterOpening.Opponents.Failed
MatterOpening.MatterRequest.Started
MatterOpening.MatterRequest.Completed
MatterOpening.MatterRequest.Failed
MatterOpening.ClioContact.Started
MatterOpening.ClioContact.Completed
MatterOpening.ClioContact.Failed
MatterOpening.ClioMatter.Started
MatterOpening.ClioMatter.Completed
MatterOpening.ClioMatter.Failed
Client.MatterOpening.PreValidation.Failed
Client.MatterOpening.Processing.StepFailed
Client.MatterOpening.Processing.Completed
```

### Standard Properties (always present on DataOps events)
- `operation` — e.g. `syncCollectedTimeHot`, `syncWipCustom_2026-01-01`
- `triggeredBy` — `scheduler` | `manual`
- `startDate` / `endDate` — date range processed
- `entity` — `CollectedTime` | `Wip`

### Metrics Tracked
- `DataOps.CollectedTime.Duration` — sync wall-clock time (ms)
- `DataOps.CollectedTime.RowsInserted` — rows written
- `DataOps.Wip.Duration` / `DataOps.Wip.RowsInserted` — same for WIP

### KQL Queries (Log Analytics)
```kql
// All data operations events
customEvents | where name startswith "DataOps" | project timestamp, name, customDimensions

// Failed syncs in last 24h
customEvents | where name endswith ".Failed" | where timestamp > ago(24h)

// Scheduler health — all tier completions
customEvents | where name startswith "Scheduler" | where name endswith ".Completed" | summarize count() by bin(timestamp, 1h), tostring(customDimensions.slotKey)

// Exceptions with context
exceptions | where customDimensions.component == "DataOps" | project timestamp, outerMessage, customDimensions

// Sync duration trends
customMetrics | where name == "DataOps.CollectedTime.Duration" | summarize avg(value) by bin(timestamp, 1d)

// Row insertion volume
customMetrics | where name endswith ".RowsInserted" | summarize sum(value) by bin(timestamp, 1d), name

// Matter opening pipeline — all events
customEvents | where name startswith "MatterOpening" or name startswith "Client.MatterOpening" | project timestamp, name, customDimensions | order by timestamp desc

// Matter opening failures in last 7 days
customEvents | where name endswith ".Failed" | where name contains "MatterOpening" | where timestamp > ago(7d) | project timestamp, name, tostring(customDimensions.instructionRef), tostring(customDimensions.error), tostring(customDimensions.initials)

// Client-side pre-validation failures (e.g. user profile not loaded)
customEvents | where name == "Client.MatterOpening.PreValidation.Failed" | project timestamp, tostring(customDimensions.instructionRef), tostring(customDimensions.error), tostring(customDimensions.feeEarner)

// Matter opening success rate (last 30 days)
customEvents | where name startswith "MatterOpening.ClioMatter" or name == "Client.MatterOpening.Processing.Completed" | where timestamp > ago(30d) | summarize count() by name, bin(timestamp, 1d)

// Matter opening duration by step
customMetrics | where name startswith "MatterOpening" | summarize avg(value) by name | order by avg_value desc
```

### Auto-Instrumentation (free from SDK)
- HTTP request/response tracking (all Express routes)
- Unhandled exceptions
- Console.log/warn/error → traces
- External dependency calls (fetch, SQL via mssql)
- Live Metrics stream
- Performance counters

### When Adding New Telemetry
1. Import: `const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');`
2. Use `Component.Entity.Lifecycle` naming
3. Always include `operation`, `triggeredBy`, and relevant IDs in properties
4. Track both success AND failure paths — the failure path is most valuable
5. Use `trackException` for catch blocks with `{ phase, entity, operation }` context
6. Use `trackMetric` for durations and counts that should be graphable
7. Properties must be strings — the helper auto-converts

### CCL Audit Attribution (Critical)
- For CCL generation/save/AI trace writes, `CreatedBy` must represent the real operator (never inferred fee earner data).
- Actor precedence is strict: `req.user.initials` → body/query/header initials (`initials` / `x-helix-initials`) → trusted email headers.
- Frontend CCL calls that persist versions or traces must include `initials` in payloads when available.
- Never fall back to matter handler/fee-earner fields for audit identity.

---

## Related Documentation

- **Database Schema**: `.github/instructions/DATABASE_SCHEMA_REFERENCE.md`
- **Clio API**: `.github/instructions/CLIO_API_REFERENCE.md`
- **Platform Operations**: `docs/PLATFORM_OPERATIONS.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
