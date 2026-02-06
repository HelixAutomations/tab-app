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

## Related Documentation

- **Database Schema**: `.github/instructions/DATABASE_SCHEMA_REFERENCE.md`
- **Clio API**: `.github/instructions/CLIO_API_REFERENCE.md`
- **Platform Operations**: `docs/PLATFORM_OPERATIONS.md`
- **Copilot Instructions**: `.github/copilot-instructions.md`
