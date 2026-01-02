# Migration 010: 2025 Fee Earner Rate Update

**Date**: 2025-12-30  
**Author**: Automated via Copilot  
**Databases**: `helix-core-data`, `instructions`  
**Table**: `dbo.team`

## Summary

Updated all fee earner rates to 2025 pricing structure and promoted Alex Cook and Jonathan Waters to Senior Partner.

## Changes Applied

| Role | Previous Rate | New Rate | Affected |
|------|--------------|----------|----------|
| **Senior Partner** (new) | - | £475 | Alex Cook, Jonathan Waters |
| Partner | £395 | £425 | Sam Packwood, Laura Albon, Brendan Rimmer |
| Associate Solicitor | £325 | £350 | Fiona Wheeler, Richard Chapman |
| Solicitor | £285/£195 | £310 | Bianca O'Donnell, Edward Lamptey, Christopher Smith, Joshua Whitcombe |
| Paralegal | £195 | £210 | All paralegals (13 people) |

## Scripts Used

- `scripts/updateRates2025.mjs` - Updates helix-core-data
- `scripts/updateRatesInstructions.mjs` - Updates instructions database

## Verification

Both databases show identical results after update:
- 2 Senior Partners @ £475
- 3 Partners @ £425  
- 2 Associate Solicitors @ £350
- 4 Solicitors @ £310
- 13 Paralegals @ £210

## Related Files

- `src/tabs/home/RateChangeModal.tsx` - Contains rate change email template (source of truth for rates)
- `src/tabs/pitch-builder/scenarios.ts` - Uses `[RATE]` and `[ROLE]` placeholders from userData

## ⚠️ IMPORTANT: Rate Synchronization

Rates exist in multiple places that MUST stay synchronized:

1. **Database**: `dbo.team` table (both databases)
2. **Template**: `RateChangeModal.tsx` lines 342-346 (email template reference)
3. **Pitch emails**: Use placeholders populated from team data

When rates change:
1. Update both databases (helix-core-data AND instructions)
2. Update RateChangeModal.tsx template if needed
3. Clear any cached team data
