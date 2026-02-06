# Enquiries Reference

Consolidates: enquiries-data-import, enquiries-file-map, enquiries-table-fields, ENQUIRY_MIGRATION_MAPPING, ENQUIRY_PITCHES_QUICK_REFERENCE, ENQUIRY_PROCESSING_V2_TEAMS_POSTING, HUB_CLAIM_ENDPOINT_SPEC.

## Core data model

### enquiries table (Core Data DB)
Key fields:
- `ID`
- `First_Name`, `Last_Name`
- `Email`, `Phone_Number`
- `Area_of_Work`
- `Company`

### Linkage
- `Deals.ProspectId` maps to `enquiries.ID` (canonical).
- Instruction data links via `ProspectId`/`InstructionRef` where available.

## Import/file mapping (summary)

- Source files map into `enquiries` with standardised column names.
- Use `First_Name`/`Last_Name`/`ID` for identifiers.
- Treat legacy keys (e.g. `acid`) as secondary mappings only.

## Pitch and timeline context

- Pitches are stored as Deals; use `Deals.ProspectId` to link to enquiries.
- Timeline should merge pitches, emails, calls, and (optionally) documents.

## Claim flow (Teams + Hub)

### Claim request
- Hub posts claim updates and Teams card updates via enquiry-processing.
- Ensure claim writes persist to tracking tables and any downstream notifications.

### Hub endpoint expectations
- Claim endpoints should update `ClaimedBy`, `ClaimedAt`, and `UpdatedAt` consistently.
- Hub consumes these fields to drive realtime claim state.

## Recommended API usage

- Enquiry list: unified server routes (avoid direct DB access from UI).
- Enquiry detail: fetch by `ID`/`ProspectId` when opening a workbench.
- Pitches: use `/api/pitches` to enrich timeline (fallback to email-based matching).

## Guardrails

- Prefer parameterised SQL queries.
- Always mask PII in logs.
- Preserve Luke Test instruction data when running any cleanup.
