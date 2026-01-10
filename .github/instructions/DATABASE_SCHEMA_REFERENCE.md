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

## Related Files

- Backend queries: `server/routes/instructions.js`, `server/routes/matter-operations.js`
- Frontend display: `src/tabs/instructions/Instructions.tsx`, `MatterOperations.tsx`
- Normalization: `src/utils/matterNormalization.ts`
- Backfill script: `scripts/backfill-instruction-matters.js`
