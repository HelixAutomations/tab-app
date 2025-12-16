# Unified Document Management - Implementation Spec

**Date**: December 15, 2025  
**Updated**: December 15, 2025 (Final)  
**Target Repository**: `HelixAutomations/instruct-pitch`  
**Target Branch**: `workspace`  
**Requestor**: Helix Hub workspace  
**Purpose**: Enable fee earner document uploads BEFORE instruction workflow (enquiry/pitch stages)

---

## Executive Summary

Currently, documents can only be uploaded **after payment** via the client-facing pitch app. Fee earners need to upload engagement letters, company searches, and other documents **much earlier** in the journey.

This spec adds a new **internal/fee-earner** upload capability that runs **parallel to** (not replacing) the existing client upload flow.

---

## The Two Upload Channels

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOCUMENT UPLOAD CHANNELS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CHANNEL 1: FEE EARNER UPLOADS (NEW)              CHANNEL 2: CLIENT UPLOADS │
│  ─────────────────────────────────                ───────────────────────── │
│  WHO: Internal staff via Helix Hub               WHO: Clients via pitch app │
│  WHEN: Enquiry, Pitch, or Instruction stage      WHEN: After payment only   │
│  AUTH: SSO (@helix-law.com)                      AUTH: Passcode link         │
│  CONTAINER: prospect-files                        CONTAINER: instruction-files│
│  TABLE: JourneyDocuments (NEW)                   TABLE: Documents (existing) │
│                                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐         ┌─────────────────────────┐│
│  │ ENQUIRY │ → │  PITCH  │ → │INSTRUCT │         │ INSTRUCTION (post-pay)  ││
│  │   📄    │   │   📄    │   │   📄    │         │          📄             ││
│  └─────────┘   └─────────┘   └─────────┘         └─────────────────────────┘│
│       ▲             ▲             ▲                          ▲              │
│       │             │             │                          │              │
│  engagement    company        risk docs            ID verification,         │
│  letters       searches                            signed engagement        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Point**: Both channels feed into a unified view. Fee earner uploads are visible alongside client uploads.

---

## Context

### The Client Journey & Document Phases

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   ENQUIRY   │ ───► │ PITCH/DEAL  │ ───► │ INSTRUCTION │ ───► │   MATTER    │
│             │      │             │      │             │      │             │
│ 📄 PHASE 1  │      │ 📄 PHASE 2  │      │ 📄 PHASE 3  │      │   (Clio)    │
│             │      │             │      │             │      │             │
│ Initial     │      │ Pitch pack  │      │ ID docs,    │      │ Transferred │
│ engagement, │      │ sent, fee   │      │ payment     │      │ to matter   │
│ conflict    │      │ quoted,     │      │ confirmed,  │      │             │
│ checks      │      │ T&Cs        │      │ compliance  │      │             │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
     │                    │                     │
     │                    │                     └── Currently: Client uploads here only
     │                    │
     │                    └── NEED: Fee earner uploads here
     │
     └── NEED: Fee earner uploads here
```

### Data Model

```
Enquiry ──────────→ Deal (Pitch) ──────────→ Instruction ──────────→ Matter
   │                    │                        │                      │
   │                    │                        │                      └── Clio (external)
   │                    │                        │
   │                    │                        └── InstructionRef (HLX-12345-67890)
   │                    │
   │                    └── Deals.ProspectId = enquiries.id (SAME ID!)
   │
   └── enquiries.id (e.g., 12345)
```

**IMPORTANT**: `ProspectId` in Deals IS the `enquiries.id`. They are the same thing.
- Legacy system used `acid` (ActiveCampaign ID) which caused confusion
- New system: `enquiries.id` is the canonical identifier
- `Deals.ProspectId` links back to `enquiries.id`
- Deals = Pitches

Documents uploaded at ANY stage should follow the client through their journey - not disappear into silos.

### Current State (The Problem)
- ❌ Fee earners **cannot** upload docs at enquiry/pitch stage
- ❌ No place to store engagement letters, company searches, T&Cs before instruction
- ✅ Clients CAN upload via `/pitch/:clientId-:passcode` → but only AFTER payment
- ✅ Client docs stored in `instruction-files` container with `InstructionRef`

### The Solution
- ✅ New fee-earner upload API (internal only, SSO auth)
- ✅ New `JourneyDocuments` table tracking full journey
- ✅ Use existing `prospect-files` container (already exists!)
- ✅ Documents "graduate" when instruction is created
- ✅ Single view shows all docs regardless of upload channel

---

## Architecture Decision

**Approach**: Unified `Documents` table with journey links

**Why**:
- Documents can belong to multiple stages (prospect doc becomes instruction doc)
- Single query shows full history
- No duplication of files
- Clear audit of when/where uploaded

---

## Database Schema

### Unified Documents Table

```sql
CREATE TABLE JourneyDocuments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    
    -- Journey links (documents "graduate" as client progresses)
    -- enquiry_id is the PRIMARY link - ProspectId in Deals IS the enquiry_id
    enquiry_id INT NOT NULL,                     -- Links to enquiries.id (= Deals.ProspectId)
    instruction_ref NVARCHAR(50) NULL,           -- Links to Instructions.InstructionRef (added when instructed)
    matter_ref NVARCHAR(50) NULL,                -- Links to Clio matter (future)
    
    -- Blob storage
    blob_url NVARCHAR(500) NOT NULL,             -- Full Azure blob URL
    blob_name NVARCHAR(500) NOT NULL,            -- Path within container
    container_name NVARCHAR(50) NOT NULL,        -- 'prospect-files' or 'instruction-files'
    
    -- File metadata
    original_filename NVARCHAR(255) NOT NULL,
    file_size INT,
    content_type NVARCHAR(100),
    document_type NVARCHAR(50),                  -- 'engagement_letter', 'id_document', 'company_search', etc.
    
    -- Audit
    uploaded_by NVARCHAR(255),                   -- Fee earner email (from SSO)
    uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
    stage_uploaded NVARCHAR(20) NOT NULL,        -- 'enquiry', 'pitch', 'instruction' - where it was FIRST uploaded
    notes NVARCHAR(MAX),
    
    -- Soft delete
    is_deleted BIT DEFAULT 0,
    deleted_at DATETIME2,
    deleted_by NVARCHAR(255),
    
    -- Foreign key to enquiries
    FOREIGN KEY (enquiry_id) REFERENCES enquiries(id),
    
    -- Indexes for common queries
    INDEX IX_JourneyDocuments_EnquiryId (enquiry_id),
    INDEX IX_JourneyDocuments_InstructionRef (instruction_ref),
    INDEX IX_JourneyDocuments_UploadedAt (uploaded_at DESC)
);
```

**Note**: There's no separate `prospect_id` column because `ProspectId` in Deals IS the `enquiry_id`.

### How Documents Graduate

1. **Fee earner uploads at Enquiry/Pitch stage**:
   ```sql
   INSERT INTO JourneyDocuments (enquiry_id, stage_uploaded, ...) 
   VALUES (12345, 'enquiry', ...)
   -- Note: enquiry_id 12345 = Deals.ProspectId 12345
   ```

2. **Client goes through pitch app → Instruction created**:
   ```sql
   -- Link existing docs to the new instruction
   UPDATE JourneyDocuments 
   SET instruction_ref = 'HLX-12345-67890'
   WHERE enquiry_id = 12345 AND instruction_ref IS NULL
   ```

3. **Client uploads ID via pitch app**:
   ```sql
   INSERT INTO JourneyDocuments (enquiry_id, instruction_ref, stage_uploaded, ...) 
   VALUES (12345, 'HLX-12345-67890', 'instruction', ...)
   ```

4. **Query all docs for client** (by enquiry_id OR instruction_ref):
   ```sql
   SELECT * FROM JourneyDocuments 
   WHERE enquiry_id = 12345
   ORDER BY uploaded_at
   ```

### Reference Tables

```sql
-- enquiries table (existing) - THE SOURCE OF TRUTH
-- enquiries.id (INT) - Primary key, this is the canonical ID

-- Deals table (existing) - Pitches
-- Deals.ProspectId (INT) = enquiries.id (SAME VALUE!)
-- Deals.DisplayNumber (NVARCHAR) - Human-readable ID

-- Instructions table (existing)
-- Instructions.InstructionRef (NVARCHAR) - e.g., 'HLX-12345-67890'
-- Instructions link back via ProspectId or similar field
```

---

## Azure Storage Setup

### Container (Already Exists!)
- **Storage Account**: `instructionfiles`
- **Container**: `prospect-files` ✅ Already exists
- **Access Level**: Private (internal only)

All containers in this account:
| Container | Purpose |
|-----------|---------|
| `instruction-files` | Client-uploaded docs (pitch app) |
| `prospect-files` | Fee earner-uploaded docs (Helix Hub) |
| `doc-processing` | Processing workspace |

### Blob Naming Convention

**Enquiry uploads** (fee earner via Helix Hub):
```
enquiries/{enquiry_id}/{sequence}-{original_filename}
```
Example: `enquiries/12345/001-engagement-letter.pdf`

**Note**: Since ProspectId = enquiry_id, this covers both enquiry and pitch stages.

**Instruction uploads** (client via pitch app - existing pattern):
```
{InstructionRef}/{sequence}-{original_filename}
```

---

## API Endpoints

### 1. Upload Document

```
POST /api/journey-upload
Content-Type: multipart/form-data

Body:
- file: [binary]
- uploaded_by: string (required) - fee earner email from SSO
- document_type: string (optional) - 'engagement_letter', 'id_document', etc.
- notes: string (optional)
- enquiry_id: number (required) - this is the same as Deals.ProspectId

Response 200:
{
  "success": true,
  "document": {
    "id": 1,
    "enquiry_id": 12345,
    "instruction_ref": null,
    "blob_url": "https://instructionfiles.blob.core.windows.net/prospect-files/enquiries/12345/001-file.pdf",
    "original_filename": "file.pdf",
    "stage_uploaded": "enquiry",
    "uploaded_at": "2025-12-15T10:30:00Z"
  }
}

Response 400: { "error": "Missing enquiry_id" }
Response 404: { "error": "Enquiry not found" }
Response 413: { "error": "File size exceeds 10MB limit" }
```

### 2. List Documents

Query by ANY journey identifier - returns all linked docs:

```
GET /api/journey-documents?enquiry_id={id}
GET /api/journey-documents?instruction_ref={ref}
GET /api/journey-documents?matter_ref={ref}

Response 200:
{
  "journey": {
    "enquiry_id": 12345,
    "instruction_ref": "HLX-12345-67890",
    "matter_ref": null
  },
  "documents": [
    {
      "id": 1,
      "blob_url": "...",
      "original_filename": "engagement-letter.pdf",
      "document_type": "engagement_letter",
      "stage_uploaded": "enquiry",
      "uploaded_by": "fee.earner@helix-law.com",
      "uploaded_at": "2025-12-15T10:30:00Z",
      "file_size": 245000,
      "notes": "Signed version"
    },
    {
      "id": 2,
      "blob_url": "...",
      "original_filename": "id-verification.pdf",
      "document_type": "id_document",
      "stage_uploaded": "instruction",
      "uploaded_by": null,
      "uploaded_at": "2025-12-16T14:20:00Z",
      "file_size": 1024000,
      "notes": null
    }
  ]
}
```

### 3. Link Documents to Next Stage

When instruction is created, link all enquiry docs:

```
POST /api/journey-documents/link
Content-Type: application/json

Body:
{
  "from_enquiry_id": 12345,
  "to_instruction_ref": "HLX-12345-67890"
}

Response 200:
{
  "success": true,
  "documents_linked": 3
}
```

### 4. Delete Document (Soft Delete)

```
DELETE /api/journey-documents/{id}
Content-Type: application/json

Body: { "deleted_by": "fee.earner@helix-law.com" }

Response 200: { "success": true }
```

### 5. Get Download URL (SAS Token)

```
GET /api/journey-documents/{id}/download

Response 200:
{
  "download_url": "https://...blob.core.windows.net/prospect-files/...?sv=...&sig=...",
  "filename": "engagement-letter.pdf",
  "expires_at": "2025-12-15T11:30:00Z"
}
```

---

## Backend Implementation

### New File: `apps/pitch/backend/journey-documents.js`

```javascript
const express = require('express');
const multer = require('multer');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const sql = require('mssql');
const { getSqlPool } = require('./sqlClient');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'mp3', 'mp4',
  'msg', 'eml',
]);

// Storage setup (reuse existing patterns from upload.js)
const account = process.env.AZURE_STORAGE_ACCOUNT;
const storageKey = process.env.AZURE_STORAGE_KEY;
const credential = storageKey
  ? new StorageSharedKeyCredential(account, storageKey)
  : new DefaultAzureCredential();
const serviceClient = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);

// Container for prospect/enquiry uploads (fee earner uploads)
const prospectContainer = serviceClient.getContainerClient('prospect-files');

// Upload endpoint
router.post('/journey-upload', upload.single('file'), async (req, res) => {
  // Implementation follows upload.js patterns
  // Key differences:
  // - Requires enquiry_id (mandatory)
  // - Optionally accepts instruction_ref if doc is for that stage
  // - Determines container and path based on input
  // - Inserts into JourneyDocuments table
  // - Sets stage_uploaded based on context
});

// List endpoint  
router.get('/journey-documents', async (req, res) => {
  const { enquiry_id, instruction_ref, matter_ref } = req.query;
  
  // Query JourneyDocuments with OR logic to get full journey
  // Also return the "journey" object showing linked IDs
});

// Link endpoint
router.post('/journey-documents/link', async (req, res) => {
  const { from_enquiry_id, to_instruction_ref } = req.body;
  
  // UPDATE JourneyDocuments SET instruction_ref = @ref 
  // WHERE enquiry_id = @eid AND instruction_ref IS NULL
});

// Delete endpoint
router.delete('/journey-documents/:id', async (req, res) => {
  // Soft delete: SET is_deleted = 1, deleted_at, deleted_by
});

// Download endpoint (SAS URL generation)
router.get('/journey-documents/:id/download', async (req, res) => {
  // Generate short-lived SAS token for download
});

module.exports = router;
```

### Register Routes in server.js

```javascript
// Add after existing uploadRouter registration
let journeyDocumentsRouter;
try {
  journeyDocumentsRouter = require('./journey-documents');
  console.log('✅ journey-documents router loaded');
} catch (err) {
  console.warn('⚠️  journey-documents router not loaded:', err.message);
}

if (journeyDocumentsRouter) {
  app.use('/api', journeyDocumentsRouter);
}
```

---

## Integration Points

### Channel 1: Fee Earner Uploads (NEW - this spec)

Fee earners use Helix Hub to upload documents at any stage:

```
Helix Hub → POST /api/journey-upload → prospect-files container → JourneyDocuments table
```

### Channel 2: Client Uploads (EXISTING - no changes needed)

Clients continue using the pitch app after payment:

```
Pitch App → POST /api/upload → instruction-files container → Documents table
```

### Unified View (Helix Hub queries both)

When displaying documents, Helix Hub will query:
1. `JourneyDocuments` table (fee earner uploads)
2. `Documents` table (client uploads)

This gives a complete picture without migrating existing data.

### When Instruction is Created

In the pitch app flow, after generating `InstructionRef`, call the link endpoint:

```javascript
// In server.js or wherever instruction is finalized
await fetch('/api/journey-documents/link', {
  method: 'POST',
  body: JSON.stringify({
    from_enquiry_id: deal.ProspectId, // ProspectId IS the enquiry_id
    to_instruction_ref: newInstructionRef
  })
});
```

---

## Implementation Checklist

### Phase 1: Core Upload (Priority)
- [x] ~~Create `prospect-files` container~~ (already exists)
- [ ] Create `JourneyDocuments` table in database
- [ ] Create `journey-documents.js` router
- [ ] Implement POST /api/journey-upload
- [ ] Implement GET /api/journey-documents
- [ ] Register routes in server.js
- [ ] Test upload and list

### Phase 2: Document Management
- [ ] Implement DELETE endpoint (soft delete)
- [ ] Implement download URL endpoint (SAS token)
- [ ] Implement POST /api/journey-documents/link

### Phase 3: Integration
- [ ] Call link endpoint when instruction is created
- [ ] (Optional) Migrate existing Documents table data

---

## Testing

### Upload Test
```bash
curl -X POST https://instruct.helix-law.com/api/journey-upload \
  -F "file=@engagement-letter.pdf" \
  -F "enquiry_id=12345" \
  -F "uploaded_by=test@helix-law.com" \
  -F "document_type=engagement_letter"
```

### List Test
```bash
curl "https://instruct.helix-law.com/api/journey-documents?enquiry_id=12345"
```

### Link Test
```bash
curl -X POST https://instruct.helix-law.com/api/journey-documents/link \
  -H "Content-Type: application/json" \
  -d '{"from_enquiry_id": 12345, "to_instruction_ref": "HLX-12345-67890"}'
```

---

## Security Considerations

1. **Internal only** - Journey upload endpoints are for fee earners, NOT clients
2. **Validate `uploaded_by`** - Should be a valid @helix-law.com email
3. **Validate IDs exist** - Check enquiries table before upload
4. **SAS tokens** - Short-lived (1 hour) for download URLs
5. **Soft delete** - Preserve audit trail, never hard delete
6. **Separate from client flow** - These endpoints do NOT replace /api/upload

---

## Future Enhancements (Not in Scope)

- [ ] Document requirements checklist by work type
- [ ] Auto-copy to Clio when matter opens
- [ ] Version history
- [ ] Approval workflows
- [ ] Migrate existing Documents table to JourneyDocuments

---

## Summary: What Gets Built Where

### instruct-pitch repo (This Spec)
| Component | Description |
|-----------|-------------|
| `JourneyDocuments` table | New SQL table for fee earner uploads |
| `journey-documents.js` | New Express router with upload/list/link/delete |
| `server.js` update | Register new routes |

### tab-app repo (Separate Work)
| Component | Description |
|-----------|-------------|
| `EnquiryDetails.tsx` | Add Documents tab with upload UI |
| `EnquiryLineItem.tsx` | Add document count badge |
| API integration | Call journey-documents endpoints |

---

## Related Files

### In instruct-pitch repo
- `apps/pitch/backend/upload.js` - Existing upload patterns to follow
- `apps/pitch/backend/server.js` - Where to register new routes
- `apps/pitch/backend/sqlClient.js` - Database connection

### In tab-app repo (for future reference)
- `src/tabs/enquiries/EnquiryDetails.tsx` - Where docs UI will go
- `src/tabs/enquiries/EnquiryLineItem.tsx` - Where badge will go
- `src/tabs/instructions/InstructionCard.tsx` - Instruction view
