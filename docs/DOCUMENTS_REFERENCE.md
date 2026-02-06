# Documents Reference

Consolidates: PROSPECT_DOCUMENT_MANAGEMENT_SPEC, DOCUMENT_TIMELINE_INTEGRATION_SPEC, TAB_APP_DOC_REQUEST_WORKSPACE_IMPLEMENTATION_SPEC, template-field-mapping, template-field-schema, snippet-schema.

## Document journey

Documents can be uploaded at enquiry, pitch, and instruction stages. Fee-earner uploads are stored alongside client uploads and surfaced in Hub timelines.

## Data model (JourneyDocuments)

```sql
CREATE TABLE JourneyDocuments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  enquiry_id INT NOT NULL,
  instruction_ref NVARCHAR(50) NULL,
  blob_url NVARCHAR(500) NOT NULL,
  original_filename NVARCHAR(255) NOT NULL,
  file_size INT,
  content_type NVARCHAR(100),
  document_type NVARCHAR(50),
  uploaded_by NVARCHAR(255),
  uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
  stage_uploaded NVARCHAR(20) NOT NULL,
  is_deleted BIT DEFAULT 0
);
```

- `enquiry_id` links to `enquiries.id`.
- `instruction_ref` links to `Instructions.InstructionRef` once available.

## Storage

- Container: `prospect-files` for fee-earner uploads.
- Blob naming: `enquiries/{enquiry_id}/{sequence}-{original_filename}`.

## Prospect docs API (instruct-pitch)

- `POST /api/prospect-documents/upload` (multipart/form-data)
- `GET /api/prospect-documents?enquiry_id=<id>`
- `GET /api/prospect-documents/count?enquiry_id=<id>`
- `GET /api/prospect-documents/:id/download`
- `DELETE /api/prospect-documents/:id` (soft delete)

## Doc-request workspace

Generate a clean link (no query params):

- `POST /api/doc-request-deals/ensure`
- Response includes `passcode` → build `https://<pitch-host>/pitch/<passcode>`.

## Timeline integration (Hub)

- Show a document count badge in Enquiry list when count > 0.
- Fetch documents for timeline and merge into events list.
- Use a document icon and Helix accent colour for document events.

## Template fields

- Template field names use Helix placeholders (e.g. `client_name`, `matter_type`).
- Maintain mapping from verbose placeholders to clean labels for the UI.

## Snippet schema (pitch builder)

Core tables:
- `DefaultBlocks`
- `DefaultBlockSnippets`
- `DefaultBlockSnippetVersions`
- `DefaultBlockEdits`
- `PlaceholderSnippets` and versions/edits tables

Use the snippet edit tables to stage changes and enforce approvals.
