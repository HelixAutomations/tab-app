# Legacy-to-New-Space Migration Tool

## Purpose

Package the manual process of migrating "old way" matters (opened directly in Clio, no enquiry/instruction chain) into the new pipeline so the full audit trail exists.

## Background

Many matters were opened before the automated pipeline existed. These have:
- Clio matters + client contacts (manually created)
- Sometimes a POID record in Core Data (if EID was done via the form)
- Legacy `matters` rows in Core Data (synced from Clio)

But they're missing:
- New-space enquiry record (Instructions DB `enquiries`)
- Deal record (Instructions DB `Deals`)
- Instruction record (Instructions DB `Instructions`)
- Matters records (Instructions DB `Matters`)
- IdVerification record (Instructions DB `IdVerifications`)

## First Migration: Bizcap Limited (2026-02-18)

### Source Data Found

| System | Record | Key |
|--------|--------|-----|
| Clio | Company contact | ID `22379201` (Bizcap Limited) |
| Clio | Matter 1 | `14205179` (BIZCA11070-00001) — Debt Recovery |
| Clio | Matter 2 | `14219414` (BIZCA11070-00002) — Unpaid Loan Recovery |
| Clio | Matter 3 | `14219459` (BIZCA11070-00003) — Unpaid Loan Recovery |
| Core Data | POID | `60-1257`, acid `30198`, check passed |
| Core Data | Legacy matters | 3 rows, all Open, Alex Cook |
| Tiller EID | Check | Overall: Passed, PEP: Passed, Address: Passed |
| Legacy enquiries | — | None (never came through enquiry form) |
| New-space enquiries | — | None |
| Instructions DB | — | No Instruction, no Deal, no IdVerification, no Matters |

### Records Created (2026-02-18)

| Table | Key | Details |
|-------|-----|---------|
| **enquiries** | id `30198` | acid `30198`, stage `instructed`, source `legacy-migration`, AoW `commercial`, rep `AC` |
| **Deals** | DealId `1170` | InstructionRef `HLX-30198-60257`, Amount £0 (TBC), Status `instructed`, AoW `commercial` |
| **Instructions** | `HLX-30198-60257` | Stage `proof-of-id-complete`, InternalStatus `pending-payment`, ClientId `22379201`, MatterId `14205179` |
| **Matters** (×3) | `14205179` | BIZCA11070-00001 — Advice on Debt Recovery |
| | `14219414` | BIZCA11070-00002 — Hazar London Ltd (Unpaid Loan Recovery) |
| | `14219459` | BIZCA11070-00003 — Selva Selvanayagam t/a Londis (Unpaid Loan Recovery) |
| **IdVerifications** | InternalId `130` | EID `70c65ac1-fa3c-44a7-ac5b-f091045b85bb`, Tiller, Passed, expires 2027-02-18 |

**Pipeline verified** via `instant-lookup.mjs pipeline HLX-30198-60257` — zero warnings, all cross-references resolve.

---

## Generalised Migration Process

### Inputs Required

| Input | Source | Required? |
|-------|--------|-----------|
| **Clio client ID** | Manual or search by name/email | Yes |
| **Clio matter IDs** | Clio API `?client_id=X` | Yes |
| **Director/individual details** | POID record or manual input | Yes |
| **Company details** | POID record or Companies House | If company client |
| **EID check data** | Tiller API response or POID record | If EID was done |
| **Deal amount** | From fee earner | Yes |
| **Service description** | From fee earner | Yes |
| **Area of work** | From Clio practice area or fee earner | Yes |
| **Fee earner initials** | Known | Yes |

### Steps

1. **Discover** — Find all existing records across systems
   - Search Clio by name/email → get client ID + matter IDs
   - Search Core Data `matters` table → confirm legacy sync
   - Search Core Data `poid` table → find EID/form data
   - Search Core Data `enquiries` → check if legacy enquiry exists
   - Search Instructions DB → check if any new-space records exist
   - Search ActiveCampaign → check if AC contact exists

2. **Resolve identifiers**
   - `acid` / `ProspectId` — use POID.acid if available, otherwise generate
   - `Passcode` — generate a random 5-digit number
   - `InstructionRef` — `HLX-{ProspectId}-{Passcode}`

3. **Create new-space enquiry** (Instructions DB `enquiries`)
   - Map director details from POID or manual input
   - Set `acid` = ProspectId, `aow` from practice area, `poc` from fee earner

4. **Create Deal** (Instructions DB `Deals`)
   - Link to InstructionRef, ProspectId, Passcode
   - Fee earner, amount, service description, area of work
   - Status = 'instructed' (already instructed, not just pitched)

5. **Create Instruction** (Instructions DB `Instructions`)
   - Full director + company details from POID
   - Stage = 'proof-of-id-complete'
   - Link ClientId + MatterId from Clio
   - EID data (IdType, document number, etc.)

6. **Create Matters** (Instructions DB `Matters`)
   - One row per Clio matter
   - Link to InstructionRef, Clio IDs, display numbers
   - Status = 'Open', all solicitor fields

7. **Create IdVerification** (Instructions DB `IdVerifications`)
   - Link to InstructionRef, MatterId, ClientId
   - EID check results from Tiller response
   - Calculate check expiry (typically +12 months from check date)

8. **Verify** — Run `instant-lookup.mjs pipeline {InstructionRef}` to confirm full chain

### Future: Automation Targets

- [ ] CLI tool: `node tools/migrate-legacy-matter.mjs --client-id 22379201 --amount 5000 --aow commercial`
- [ ] Auto-discover from Clio client ID (pull matters, search POID, resolve EID)
- [ ] Batch mode for multiple clients
- [ ] Dry-run mode (show what would be created without inserting)
- [ ] Validation: check for conflicts/duplicates before inserting
