# Database Schema Reference

## CRITICAL: Database Connection Patterns

### Instructions Database (Primary)
```javascript
// ALWAYS use .env for credentials
import { config } from 'dotenv';
import sql from 'mssql';
config();

// Connection string from .env (INSTRUCTIONS_SQL_CONNECTION_STRING)
const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
const pool = await sql.connect(connectionString);
```

**Node ESM quick scripts**

When using `node -e`/dynamic import, `mssql` can be under `default`. Use:
```javascript
const m = await import('mssql');
const sql = m.default || m;
const pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
```

### Helix Core Data Database (Enquiries/Matters)
```javascript
// Connection string from .env (SQL_CONNECTION_STRING)  
const connectionString = process.env.SQL_CONNECTION_STRING;
const pool = await sql.connect(connectionString);
```

### Common Query Patterns
```javascript
// Instructions table lookup by passcode
const dealQuery = `SELECT * FROM Deals WHERE Passcode = '${passcode}'`;

// Enquiries lookup by ID (ProspectId)
const enquiryQuery = `SELECT First_Name, Last_Name, Email FROM enquiries WHERE ID = ${prospectId}`;

// Always use pool.request().query() format:
const result = await pool.request().query(queryString);
```

---

## Overview
This document describes the key database tables, their relationships, and important schema patterns discovered through investigation. Use this as a reference for understanding data flows between the frontend, backend, and Clio API.

---

## Legacy vs New Space Enquiries (CRITICAL)

**Legacy (Core Data DB: `helix-core-data`)**
- Table: `enquiries`
- Primary key: `ID`
- Notes field: `Initial_first_call_notes`

**New Space (Instructions DB: `instructions`)**
- Table: `dbo.enquiries`
- Primary key: `id`
- Notes field: `notes`
- **Linkage key**: `acid` = **ProspectId** from `Deals`

**Linking matters → enquiries (authoritative order)**
1. Matter → `InstructionRef`
2. Instruction → Deal (same `InstructionRef`)
3. Deal → `ProspectId`
4. New space enquiry: match `dbo.enquiries.acid = Deals.ProspectId`
5. Legacy enquiry (fallback): match `enquiries.ID = Deals.ProspectId`

**Key rule**: `Deals.ProspectId` is the authoritative bridge to **new-space enquiries** (`acid`).

---

## Quick lookup templates (ESM-safe)

**One-off lookup hygiene (CRITICAL)**
- Do **not** commit ad-hoc lookup scripts with client data.
- Prefer `tools/instant-lookup.mjs` or short-lived `node -e` commands.
- If a script is unavoidable, delete it immediately after use.

**New space enquiry by ProspectId (acid)**
```javascript
const m = await import('mssql');
const sql = m.default || m;
const pool = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
const result = await pool.request()
  .input('pid', sql.NVarChar(100), String(prospectId))
  .query('SELECT TOP 5 * FROM dbo.enquiries WHERE acid = @pid ORDER BY datetime DESC');
```

**Legacy enquiry by ProspectId (ID)**
```javascript
const m = await import('mssql');
const sql = m.default || m;
const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
const result = await pool.request()
  .input('pid', sql.Int, Number(prospectId))
  .query('SELECT TOP 5 * FROM enquiries WHERE ID = @pid ORDER BY Date_Created DESC');
```

**ELOGIN fallback (SQL)**
If `SQL_CONNECTION_STRING` fails, use:
```javascript
const { getSecret } = await import('../server/utils/getSecret.js');
const sqlPassword = await getSecret('sql-databaseserver-password');
const conn = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${sqlPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
```

---

## Database Connection

**Instructions DB**: `instructions.database.windows.net/instructions`  
**Core Data DB**: `helix-database-server.database.windows.net/helix-core-data`  
**Authentication**: Azure SQL (credentials in .env)

**Tools Available**:
- MSSQL extension in VS Code (use `mssql_*` tools)
- Direct queries via `mssql` npm package in Node.js scripts

---

## Core Tables

### Instructions Table

**Primary Key**: `InstructionRef` (string, e.g., "HLX-27887-30406")

**Critical Fields**:
```
InstructionRef          NVARCHAR(50)    PRIMARY KEY
Stage                   NVARCHAR(50)    Workflow stage (e.g., 'initialised', 'pitch', 'proof-of-id-complete')
ClientType              NVARCHAR(20)    'Individual' or 'Company'
HelixContact            NVARCHAR(200)   Staff initials (e.g., 'BOD', 'RC', 'LZ')
ConsentGiven            BIT             
InternalStatus          NVARCHAR(50)    
SubmissionDate          DATE            
SubmissionTime          TIME            
LastUpdated             DATETIME2       

-- Client Linkage (populated via Clio API)
ClientId                NVARCHAR(50)    Clio Contact ID (e.g., '20134504')
RelatedClientId         NVARCHAR(50)    Optional related contact
MatterId                NVARCHAR(50)    Clio Matter ID (e.g., '12651064')

-- Individual Client Fields
Title                   NVARCHAR(20)    
FirstName               NVARCHAR(100)   
LastName                NVARCHAR(100)   
Nationality             NVARCHAR(100)   
NationalityAlpha2       NVARCHAR(10)    2-letter country code
DOB                     DATE            
Gender                  NVARCHAR(20)    
Phone                   NVARCHAR(50)    
Email                   NVARCHAR(200)   CRITICAL for backfill/client creation
PassportNumber          NVARCHAR(100)   
DriversLicenseNumber    NVARCHAR(100)   
IdType                  NVARCHAR(50)    'passport' or 'drivers-license'

-- Individual Address
HouseNumber             NVARCHAR(50)    
Street                  NVARCHAR(200)   
City                    NVARCHAR(100)   
County                  NVARCHAR(100)   
Postcode                NVARCHAR(20)    
Country                 NVARCHAR(100)   
CountryCode             NVARCHAR(10)    2-letter country code

-- Company Client Fields
CompanyName             NVARCHAR(200)   
CompanyNumber           NVARCHAR(50)    
CompanyHouseNumber      NVARCHAR(50)    
CompanyStreet           NVARCHAR(200)   
CompanyCity             NVARCHAR(100)   
CompanyCounty           NVARCHAR(100)   
CompanyPostcode         NVARCHAR(20)    
CompanyCountry          NVARCHAR(100)   
CompanyCountryCode      NVARCHAR(10)    

Notes                   NVARCHAR(MAX)   
```

**Key Patterns**:
- `ClientId` and `MatterId` are **NULL** until matter opening workflow completes
- Instructions that never complete matter opening remain stuck at 'initialised' or 'pitch' stage
- Email address is **required** for creating Clio clients
- `ClientType` determines whether to use individual or company fields

---

### Matters Table

**Primary Key**: `MatterID` (string, can be Clio Matter ID or GUID)

**Critical Fields**:
```
MatterID                NVARCHAR(255)   PRIMARY KEY - Clio Matter ID (e.g., '12651064') or GUID for placeholders
InstructionRef          NVARCHAR(50)    FOREIGN KEY to Instructions table
Status                  NVARCHAR(50)    'Open', 'Closed', or 'MatterRequest' (placeholder)
OpenDate                DATE            
OpenTime                TIME            
CloseDate               DATE            
ClientID                NVARCHAR(255)   Clio Client ID
RelatedClientID         NVARCHAR(255)   
DisplayNumber           NVARCHAR(255)   Clio matter number (e.g., 'SCOTT10803-00001')
ClientName              NVARCHAR(255)   
ClientType              NVARCHAR(255)   
Description             NVARCHAR(MAX)   
PracticeArea            NVARCHAR(255)   
ApproxValue             NVARCHAR(50)    
ResponsibleSolicitor    NVARCHAR(255)   
OriginatingSolicitor    NVARCHAR(255)   
SupervisingPartner      NVARCHAR(255)   
Source                  NVARCHAR(255)   
Referrer                NVARCHAR(255)   
method_of_contact       NVARCHAR(50)    
OpponentID              UNIQUEIDENTIFIER
OpponentSolicitorID     UNIQUEIDENTIFIER
```

**Key Patterns**:
- **Placeholder Records**: Status='MatterRequest' with GUID MatterID, no DisplayNumber/ClientName
  - Created when instruction workflow starts but matter opening never completes
  - Multiple placeholders can exist for same InstructionRef
- **Real Clio Records**: Status='Open', MatterID is numeric Clio ID, has DisplayNumber/ClientName
- **Data Flow**: Instructions.MatterId → Matters.MatterID (join relationship)

**Duplicate Handling**:
- When updating from Clio backfill: Update first placeholder, delete additional duplicates
- Use `WHERE InstructionRef = ? AND Status = 'MatterRequest'` to find placeholders

---

## Data Relationships

```
Instructions (1) ←→ (0..N) Matters
  Join: Instructions.InstructionRef = Matters.InstructionRef
  
Instructions (1) → (0..1) Clio Contact
  Link: Instructions.ClientId → Clio API Contact ID
  
Instructions (1) → (0..1) Clio Matter  
  Link: Instructions.MatterId → Clio API Matter ID
  
Matters (1) → (0..1) Clio Matter
  Link: Matters.MatterID → Clio API Matter ID
```

**Backend Query Pattern**:
```javascript
// server/routes/instructions.js
// Query joins Instructions with Matters to build instruction.matters[] array
const result = await request.query(`
  SELECT i.*, m.* 
  FROM Instructions i
  LEFT JOIN Matters m ON i.InstructionRef = m.InstructionRef
  WHERE ...
`);

// If Matters has only placeholders (no DisplayNumber), instruction.matters[] is effectively empty
```

---

## Schema Evolution Notes

### Legacy vs New Schema

The codebase contains references to **two schema patterns**:

**Legacy Schema** (spaced keys):
```javascript
"Display Number"
"Unique ID"  
"Client Name"
"Practice Area"
```

**New Schema** (snake_case/PascalCase):
```javascript
DisplayNumber
MatterID
ClientName
PracticeArea
```

**Current State**: Matters table uses **PascalCase** (new schema).

**Normalization**: Use `src/utils/matterNormalization.ts` when handling mixed schema data.

---

## Common Query Patterns

### Find Instructions Missing Matter Data
```sql
SELECT InstructionRef, Email, FirstName, LastName, ClientId, MatterId
FROM Instructions
WHERE Stage IN ('initialised', 'pitch', 'proof-of-id-complete')
  AND (ClientId IS NULL OR MatterId IS NULL)
  AND Email IS NOT NULL;
```

### Find Placeholder Matter Records
```sql
SELECT MatterID, InstructionRef, Status
FROM Matters
WHERE Status = 'MatterRequest'
  AND DisplayNumber IS NULL;
```

### Verify Instruction-Matter Linkage
```sql
SELECT 
    i.InstructionRef,
    i.ClientId AS InstructionClientId,
    i.MatterId AS InstructionMatterId,
    m.MatterID AS MattersRecordId,
    m.DisplayNumber,
    m.Status
FROM Instructions i
LEFT JOIN Matters m ON i.MatterId = m.MatterID
WHERE i.InstructionRef = 'HLX-XXXXX-XXXXX';
```

---

## Important Constraints

1. **InstructionRef Format**: Always 'HLX-XXXXX-XXXXX' pattern
2. **Email Required**: Cannot create Clio clients without valid email address
3. **ClientType Drives Fields**: Individual uses FirstName/LastName, Company uses CompanyName
4. **NULL Handling**: Many fields nullable - always check NULL before using
5. **GUID vs Numeric IDs**: 
   - Placeholder matters use GUID MatterID
   - Real Clio matters use numeric string MatterID (e.g., '12651064')

---

## Collected Time (`collectedTime`)

**Database**: Core Data DB (`SQL_CONNECTION_STRING`)
**Purpose**: Invoice payment line items synced from Clio. Each row = one payment allocation for a time entry. **CRITICAL**: The `id` column is a Clio line-item ID, NOT a unique row identifier. The same `id` can legitimately appear multiple times when a time entry is allocated across multiple invoices (split payments). `COUNT(DISTINCT id) ≠ COUNT(*)` is expected behaviour, not duplication.

### Schema Summary

| Column | Type | Purpose |
|--------|------|---------|
| `matter_id` | int | Clio matter ID |
| `bill_id` | int | Clio bill/invoice ID — key to understanding splits |
| `contact_id` | int | Clio contact ID |
| `id` | int | Clio line-item ID — NOT unique per row |
| `date` | date | Time entry date |
| `created_at` | datetime | When record was created in Clio |
| `kind` | nvarchar | Entry kind |
| `type` | nvarchar | Entry type |
| `activity_type` | nvarchar | Activity classification |
| `description` | text | Time entry description (use CAST to VARCHAR for aggregates) |
| `sub_total` | decimal | Pre-tax amount |
| `tax` | decimal | Tax amount |
| `secondary_tax` | decimal | Secondary tax |
| `user_id` | int | Clio user ID |
| `user_name` | nvarchar | Fee earner name |
| `payment_allocated` | decimal | Amount allocated to this payment |
| `payment_date` | date | Date payment was allocated — primary date column for queries |

### Key Query Patterns

```sql
-- Total collected in a period (use SUM of all rows, NOT DISTINCT)
SELECT SUM(CAST(payment_allocated AS DECIMAL(18,2))) FROM collectedTime
WHERE payment_date >= '2026-02-01' AND payment_date <= '2026-02-07';

-- Understand split allocations
SELECT id, COUNT(*) as rows, COUNT(DISTINCT bill_id) as bills,
  SUM(CAST(payment_allocated AS DECIMAL(18,2))) as total
FROM collectedTime WHERE payment_date >= '2026-02-01' AND payment_date <= '2026-02-07'
GROUP BY id HAVING COUNT(*) > 1;

-- Per-user breakdown
SELECT user_name, COUNT(*) rows, COUNT(DISTINCT id) payments,
  SUM(CAST(payment_allocated AS DECIMAL(18,2))) total
FROM collectedTime WHERE payment_date BETWEEN '2026-02-01' AND '2026-02-07'
GROUP BY user_name, user_id ORDER BY total DESC;
```

### Sync Pipeline

Source: Clio Reports API (`invoice_payments_v2`)
Route: `server/routes/dataOperations.js` → `syncCollectedTime()`
Schedule: `server/utils/dataOperationsScheduler.js`
UI: `src/tabs/Reporting/components/OperationValidator.tsx`

Pipeline: Request Clio report → Poll until ready → Download JSON → DELETE existing rows in date range → INSERT each line item → Auto-validate (COUNT/SUM)

### Anti-pattern (NEVER DO THIS)

```sql
-- ❌ This deletes legitimate split allocations and loses real revenue
DELETE FROM collectedTime WHERE id IN (
  SELECT id FROM collectedTime GROUP BY id HAVING COUNT(*) > 1
);
-- This previously destroyed £150k of collected revenue data
```

---

## WIP (`wip`)

**Database**: Core Data DB (`SQL_CONNECTION_STRING`)
**Purpose**: Unbilled time entries and expenses synced from Clio Activities API. Each row = one activity (TimeEntry or ExpenseEntry). Unlike `collectedTime`, the `id` column IS unique per row — each Clio activity has a single ID.

### Schema Summary

| Column | Type | Purpose |
|--------|------|---------|
| `id` | int | Clio activity ID (unique per row) |
| `date` | date | Activity date |
| `created_at_date` | date | Date portion of Clio created_at |
| `created_at_time` | time | Time portion of Clio created_at |
| `updated_at_date` | date | Date portion of Clio updated_at |
| `updated_at_time` | time | Time portion of Clio updated_at |
| `type` | nvarchar | `TimeEntry` or `ExpenseEntry` |
| `matter_id` | int | Clio matter ID |
| `matter_display_number` | nvarchar | Clio display number (e.g., `SCOTT10803-00001`) |
| `quantity_in_hours` | decimal | Hours recorded (0 for expenses) |
| `note` | nvarchar(max) | Activity description/narrative |
| `total` | decimal | Total value £ — primary amount column |
| `price` | decimal | Rate applied |
| `expense_category` | nvarchar | Expense category (stringified `id: X, name: Y`) or NULL |
| `activity_description_id` | int | Clio activity description ID |
| `activity_description_name` | nvarchar | Activity description label |
| `user_id` | int | Clio user ID |
| `bill_id` | int | Clio bill ID (NULL if unbilled) |
| `billed` | bit | Whether the activity has been billed |
| `non_billable` | bit | Whether the activity is marked non-billable in Clio (DEFAULT 0) |

### Key Differences from `collectedTime`

| Aspect | `collectedTime` | `wip` |
|--------|-----------------|-------|
| Source API | Reports API (`invoice_payments_v2`) | Activities API (`/activities.json`) |
| ID uniqueness | NOT unique (split payments) | Unique per row |
| Amount column | `payment_allocated` | `total` |
| Has hours | No (payments, not time) | Yes (`quantity_in_hours`) |
| Dedup strategy | Never dedup by `id` alone | Safe to dedup by `id` (post-sync CTE) |
| Types | `kind` (Service/Expense) | `type` (TimeEntry/ExpenseEntry) |

### Key Query Patterns

```sql
-- Total WIP value in a period
SELECT SUM(CAST(total AS DECIMAL(18,2))) FROM wip
WHERE date >= '2026-02-01' AND date <= '2026-02-07';

-- WIP by type with hours
SELECT type, COUNT(*) as rows, SUM(CAST(quantity_in_hours AS DECIMAL(18,2))) as hours,
  SUM(CAST(total AS DECIMAL(18,2))) as total
FROM wip WHERE date BETWEEN '2026-02-01' AND '2026-02-07'
GROUP BY type;

-- Billable vs non-billable
SELECT non_billable, COUNT(*) as rows, SUM(CAST(total AS DECIMAL(18,2))) as total
FROM wip WHERE date BETWEEN '2026-02-01' AND '2026-02-07'
GROUP BY non_billable;
```

### Sync Pipeline

Source: Clio Activities API (`/api/v4/activities.json`)
Route: `server/routes/dataOperations.js` → `syncWip()` (via `/api/data-operations/sync-wip`)
Schedule: `server/utils/dataOperationsScheduler.js` (daily alongside collected)
UI: `src/tabs/Reporting/components/OperationValidator.tsx`

Pipeline: Paginate Clio Activities API (200/page) → DELETE existing rows in date range → Batch INSERT (100 rows × 20 cols = 2000 params, under SQL Server's 2100 limit) → Post-insert dedup CTE → Auto-validate (COUNT/SUM/hours/type breakdown)

### Batch Strategy

20 columns × 100 rows = 2,000 parameters per batch (SQL Server limit: 2,100). If a batch INSERT fails, falls back to individual row inserts so one bad record doesn't lose the batch.

### Anti-pattern (NEVER DO THIS)

```sql
-- ❌ Don't use sub_total — that's collectedTime's column
-- WIP's amount column is `total`
SELECT SUM(sub_total) FROM wip;  -- WRONG: column doesn't exist
SELECT SUM(total) FROM wip;      -- CORRECT
```

---

## Data Operations Log (`dataOpsLog`)

**Database**: Instructions DB (`instructions.database.windows.net/instructions`)  
**Purpose**: Persistent audit log for all data sync operations (Clio→SQL, AC→SQL, etc.)

### Dynamic Inspection (Preferred)

```sql
-- Get schema dynamically
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'dataOpsLog' ORDER BY ORDINAL_POSITION;

-- Recent operations
SELECT TOP 20 * FROM dataOpsLog ORDER BY ts DESC;

-- Filter by entity
SELECT * FROM dataOpsLog WHERE entity = 'collectedTime' AND status = 'completed' ORDER BY ts DESC;
```

### Schema Summary

| Column | Type | Purpose |
|--------|------|---------|
| `id` | bigint PK | Auto-increment |
| `ts` | datetime2 | UTC timestamp (default: SYSUTCDATETIME) |
| `jobId` | uniqueidentifier | Correlates start/progress/complete/abort for same job |
| `operation` | nvarchar(120) | e.g., 'syncCollectedTimeDaily', 'syncMattersBackfill' |
| `entity` | nvarchar(60) | Target: 'collectedTime', 'wip', 'matters', 'contacts' |
| `sourceSystem` | nvarchar(30) | Origin: 'clio', 'activecampaign', 'meta', 'google', 'internal' |
| `direction` | nvarchar(12) | 'inbound' (API→SQL), 'outbound', 'bidirectional' |
| `status` | nvarchar(20) | 'started', 'progress', 'completed', 'error', 'aborted' |
| `message` | nvarchar(500) | Human-readable status/error |
| `startDate` | date | Sync window start |
| `endDate` | date | Sync window end |
| `deletedRows` | int | Rows removed |
| `insertedRows` | int | Rows added |
| `changedRows` | int | Rows updated (bidirectional sync) |
| `durationMs` | int | Elapsed time |
| `triggeredBy` | nvarchar(40) | 'scheduler', 'manual', 'webhook' |
| `invokedBy` | nvarchar(120) | User email/initials |
| `meta` | nvarchar(max) | JSON overflow for edge cases |

### Indexes

- `IX_dataOpsLog_ts` (ts DESC) - Recent operations
- `IX_dataOpsLog_jobId` (jobId) WHERE jobId IS NOT NULL - Job correlation
- `IX_dataOpsLog_operation_ts` (operation, ts DESC) - Operation history
- `IX_dataOpsLog_entity_ts` (entity, ts DESC) WHERE entity IS NOT NULL - Entity history

### Implementation Reference

- **Backend**: `server/routes/dataOperations.js` → `logOperation()`
- **Frontend**: `src/tabs/Reporting/DataCentre.tsx` → fetches `/api/data-operations/log`
- **Scheduler**: `server/utils/dataOperationsScheduler.js`

---

## CCL Persistence Layer (Instructions DB)

Three tables powering the CCL audit trail, content versioning, and AI trace history.

### CclDrafts (legacy — basic draft persistence)
| Column    | Type         | Notes |
|-----------|-------------|-------|
| MatterId  | NVARCHAR(50) | PK (upsert via MERGE) |
| DraftJson | NVARCHAR(MAX)| Full field JSON blob |
| UpdatedAt | DATETIME2    | Last save time |

### CclContent (versioned content snapshots)
| Column              | Type           | Notes |
|---------------------|---------------|-------|
| CclContentId        | INT IDENTITY  | PK |
| MatterId            | NVARCHAR(50)  | Indexed |
| InstructionRef      | NVARCHAR(100) | Nullable, indexed |
| ClientName          | NVARCHAR(200) | Denormalised for admin queries |
| ClientEmail         | NVARCHAR(200) | |
| ClientAddress       | NVARCHAR(500) | |
| MatterDescription   | NVARCHAR(500) | |
| FeeEarner           | NVARCHAR(100) | |
| FeeEarnerEmail      | NVARCHAR(200) | |
| SupervisingPartner  | NVARCHAR(100) | |
| PracticeArea        | NVARCHAR(100) | |
| FieldsJson          | NVARCHAR(MAX) | All template field values |
| ProvenanceJson      | NVARCHAR(MAX) | `{ field: 'ai'|'auto'|'user'|'default' }` |
| Version             | INT           | Auto-increments per matter |
| Status              | NVARCHAR(20)  | draft / final / uploaded |
| UploadedToClio      | BIT           | |
| UploadedToNd        | BIT           | |
| ClioDocId           | NVARCHAR(100) | |
| NdDocId             | NVARCHAR(100) | |
| CreatedBy           | NVARCHAR(50)  | User initials |
| CreatedAt           | DATETIME2     | Default SYSDATETIME() |
| FinalizedAt         | DATETIME2     | When uploaded/sent |
| FinalizedBy         | NVARCHAR(50)  | |

### CclAiTrace (AI fill audit trail)
| Column              | Type           | Notes |
|---------------------|---------------|-------|
| CclAiTraceId        | INT IDENTITY  | PK |
| MatterId            | NVARCHAR(50)  | Indexed |
| TrackingId          | NVARCHAR(20)  | 8-char random ID, indexed |
| AiStatus            | NVARCHAR(20)  | complete / partial / fallback |
| Model               | NVARCHAR(50)  | Deployment name |
| DurationMs          | INT           | |
| Temperature         | FLOAT         | |
| SystemPrompt        | NVARCHAR(MAX) | Full text, never truncated |
| UserPrompt          | NVARCHAR(MAX) | Full text |
| UserPromptLength    | INT           | |
| AiOutputJson        | NVARCHAR(MAX) | Raw AI response fields |
| GeneratedFieldCount | INT           | |
| Confidence          | NVARCHAR(20)  | full / partial / fallback |
| DataSourcesJson     | NVARCHAR(MAX) | Array of source names |
| ContextFieldsJson   | NVARCHAR(MAX) | Structured context |
| ContextSnippetsJson | NVARCHAR(MAX) | Text chunks |
| FallbackReason      | NVARCHAR(500) | |
| ErrorMessage        | NVARCHAR(500) | |
| CreatedBy           | NVARCHAR(50)  | |
| CreatedAt           | DATETIME2     | Default SYSDATETIME() |

### Implementation Reference
- **Migration**: `tools/db/migrate-ccl-persistence.sql` (idempotent, run via `tools/db/run-ccl-migration.mjs`)
- **Persistence utility**: `server/utils/cclPersistence.js` — saveCclContent, saveCclAiTrace, getCclStats, listAllCcls, saveCclAssessment, etc.
- **Admin API**: `server/routes/ccl-admin.js` — GET stats, list matters, traces, assessments
- **Wiring**: `server/routes/ccl.js` (POST/PATCH save CclContent), `server/routes/ccl-ai.js` (POST /fill saves CclAiTrace)
- **Frontend**: `src/tabs/matters/ccl/CclOpsPanel.tsx` — admin ops panel with assessment system in PreviewStep

---

## Related Files

- Backend queries: `server/routes/instructions.js`, `server/routes/matter-operations.js`
- Frontend display: `src/tabs/instructions/Instructions.tsx`, `MatterOperations.tsx`
- Normalization: `src/utils/matterNormalization.ts`
