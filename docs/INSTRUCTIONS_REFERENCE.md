# Instructions Reference

Consolidates: Instruction-data-handbook, instruction-scenarios, local-instruction-scenarios, matters-schema, MIGRATION_GUIDE_UNIFIED_INSTRUCTIONS, UNIFIED_INSTRUCTIONS_ENDPOINT, QUICKSTART_INSTRUCTIONS, INSTRUCTIONS_VNET.

## Core concepts

- Unified instruction data is served via the Express server and a VNet Azure Function.
- UI uses a single `/api/instructions?includeAll=true` call to avoid N+1 requests.

## Health indicator

- **Luke Test**: `HLX-27367-94842` is the production health indicator. Never delete.

## Unified endpoint

### Frontend call
`GET /api/instructions?includeAll=true`

### Server flow
- Express route proxies to VNet function with `INSTRUCTIONS_FUNC_CODE`.
- VNet function queries production SQL within VNet access.

## VNet requirements (summary)

- Production SQL is only accessible from VNet resources.
- Local dev must use VNet functions for production data.

## Data shape (summary)

- Instructions + Deals + related entities are aggregated server-side.
- Instruction details are enriched for workbench/pill states.

## Scenarios

### Instruction scenarios
- Use consistent status/pill behaviour for ID, Payment, Risk, Documents, Matter.
- Completed pills show details; next-action pills trigger actions.

### Local scenarios
- Use local scenario data only when `REACT_APP_USE_LOCAL_DATA=true`.

## Matters linkage

- Matters are linked via InstructionRef/ProspectId and matter normalisation.
- Keep legacy field formats in mind (`Display Number`, `Unique ID`).

## Maintenance guardrails

- Use `RiskAssessmentResult` for risk colour.
- ID pill must trigger `onEIDClick()` (no detail expansion).
- Deal capture emails go to both `lz@helix-law.com` and `cb@helix-law.com`.
