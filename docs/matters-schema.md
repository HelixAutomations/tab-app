# Matters Schema (New-first policy)

This document defines the canonical shape for Matter data and how we normalize mixed inputs. All contributors should read this before editing matters-related code.

## Direction of travel
- Primary: NEW schema (vnet/new-service). Prefer snake_case keys like `matter_id`, `display_number`, `client_name`, `open_date`, `close_date`, etc.
- Secondary: New UpperCase API variants (e.g., `MatterID`, `DisplayNumber`) are also acceptable and map 1:1 to the new schema.
- Legacy: Spaced-key legacy fields (e.g., `"Display Number"`, `"Unique ID"`) are deprecated and should not be extended. Only support them in the normalization adapter.

## Normalized type (frontend)
See `src/app/functionality/types.ts -> NormalizedMatter` for the target shape used across the UI.

Key fields:
- Core IDs: `matterId`, `displayNumber`, `instructionRef`
- Dates: `openDate`, `closeDate`, `status` (derived)
- Client: `clientId`, `clientName`, `clientPhone`, `clientEmail`
- Details: `description`, `practiceArea`, `source`, `referrer`, `value`
- People: `responsibleSolicitor`, `originatingSolicitor`, `supervisingPartner`
- Opposition: `opponent`, `opponentSolicitor`
- Meta: `methodOfContact`, `cclDate`, `rating`, `modStamp`
- Provenance: `dataSource` (one of `legacy_all`, `legacy_user`, `vnet_direct`)

## Mapping guidance
When adding or modifying adapters in `src/utils/matterNormalization.ts`:
- Prefer keys in this order: snake_case (new) -> UpperCase (new) -> legacy (spaced) -> generic fallbacks.
- Treat `matter_id`/`MatterID` as the canonical identifier; accept `UniqueID`/`"Unique ID"` only as a fallback.
- Derive `status` from `close_date`/`CloseDate`.
- Keep the adapter pure and well-typed; add JSDoc and unit tests for new behaviors.

## Caution for editors (big red box in spirit)
This area is under migration. Do not introduce new dependencies on spaced legacy keys. If you’re unsure, ping the team or add a comment explaining the assumption and add a test.

## One helpful takeaway
If a matter “disappears,” check the ID mapping first. Legacy payloads may expose `UniqueID` or `"Unique ID"` instead of `matter_id`/`MatterID`. Update `normalizeMatterData` to include the variant, then bump any cache keys if needed.
