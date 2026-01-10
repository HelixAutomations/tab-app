# Team & Rate Data Reference

## Overview

Team data (including hourly rates) is stored in **two synchronized databases**:
- `helix-core-data.dbo.team` - Primary for attendance, dashboard
- `instructions.dbo.team` - Used by pitch builder, instruction processing

**⚠️ CRITICAL**: Both must be updated together when rates change.

---

## Current Rate Structure (2025)

| Role | Rate (ex-VAT) |
|------|---------------|
| Senior Partner | £475 |
| Partner | £425 |
| Associate Solicitor | £350 |
| Solicitor | £310 |
| Paralegal/Trainee | £210 |

---

## Database Connections

### helix-core-data
- **Server**: `helix-database-server.database.windows.net`
- **Connection**: `SQL_CONNECTION_STRING` env var
- **Password**: `sql-databaseserver-password` in `helix-keys` Key Vault

### instructions
- **Server**: `instructions.database.windows.net`
- **Connection**: `INSTRUCTIONS_SQL_CONNECTION_STRING` env var
- **Password**: `instructionsadmin-password` in `helixlaw-instructions` Key Vault

---

## Team Table Schema

```sql
[dbo].[team]
├── [Full Name]        -- Display name
├── [First]            -- First name (for lookups)
├── [Last]             -- Last name (for lookups)
├── [Role]             -- Position title: Partner, Solicitor, Paralegal, etc.
├── [Rate]             -- Hourly rate in GBP (ex-VAT, integer)
├── [Initials]         -- 2-3 letter initials
├── [Email]            -- Work email
├── [status]           -- 'active' or 'inactive'
├── [AOW]              -- Areas of work (comma-separated)
└── [holiday_entitlement] -- Annual leave days
```

---

## Annual Leave Approvals (AOW routing)

Annual leave approver routing is derived from the `AOW` field (case-insensitive, comma-separated).

- If `AOW` includes `construction` → route approvals to **JW**
- Otherwise → route approvals to **AC**
- **LZ** is always included as an approver

Implementation reference: [api/src/functions/getAnnualLeave.ts](api/src/functions/getAnnualLeave.ts) (`determineApprovers`).

---

## Rate Update Procedure

### 1. Identify Changes
Check `src/tabs/home/RateChangeModal.tsx` for official rate structure.

### 2. Update Scripts
Use existing scripts in `scripts/`:
- `updateRates2025.mjs` - Template for helix-core-data
- `updateRatesInstructions.mjs` - Template for instructions DB

### 3. Execute Updates
```bash
node scripts/updateRates2025.mjs           # helix-core-data
node scripts/updateRatesInstructions.mjs   # instructions
```

### 4. Verify
Query via API: `GET /api/team-data`

### 5. Document
Create migration record in `database/migrations/`

---

## Where Rates Are Used

| Location | Usage |
|----------|-------|
| `RateChangeModal.tsx` | Email template showing rate structure |
| `scenarios.ts` | Pitch templates with `[RATE]` placeholder |
| Pitch emails | Populated from userData.rate |
| Time recording | Billing calculations |

---

## Related Migrations

- `010_2025_rate_update.md` - 2025 rate structure, Senior Partner role added
