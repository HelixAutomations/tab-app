# Helix Operations Platform

Shared utility/audit database for cross-app concerns (AI proposals, form
submissions audit, scheduler state, future ops surfaces). Lives in the
existing `operations` resource group on the **Helix Automations**
subscription so the cost/ownership story matches the existing
`operations-cognito-endpoints` Function App that's already there.

## What it is

| | |
|---|---|
| **Resource group** | `operations` (existing — UK South) |
| **SQL server** | `helix-operations-sql.database.windows.net` |
| **Database** | `helix-operations` |
| **SKU** | GP_S_Gen5_2 serverless (0.5–2 vCores, auto-pause 60 min) |
| **Region** | UK South |
| **Admin login** | `helixopsadmin` |
| **Vault for secrets** | `Helix-Keys` (existing, in `Main` RG) |
| **Estimated cost** | £8–25/mo typical, £0/hr while paused |

Not used yet by `instruct-pitch` or `enquiry-processing-v2` — but the
naming and design assume those apps will share it. When they do, they get
their own SQL user with scoped grants, never the admin login.

## What lives here

Started as the home for `dbo.ai_proposals` (Forms AI Composer audit). Will
grow to include:

- `dbo.ai_proposals` — every AI suggestion across surfaces (Forms Composer, ⌘K, etc.)
- `dbo.form_submissions` — migrated from `helix-core-data` once Forms-as-real-system lands
- `dbo.form_processing_steps` — server-side processing audit (replaces Power Automate hops)
- `dbo.hub_todo` — Home ToDo registry (every hub-originating pickup item; feeds Home card + Activity feed from one INSERT)
- Scheduler state for cross-app jobs
- Recruitment-platform shared tables when that comes online

What does **not** live here:

- Live operational data (matters, enquiries, instructions) → stays in `helix-core-data` / `instructions`
- CCL drafts → stay on `CclDrafts` / `CclAiTraces` in core-data
- App secrets → stay in `Helix-Keys` vault

## Kill switches (in order of severity)

### Tier 1 — Repo-level flag (instant, no Azure call)

```
# .env
OPS_PLATFORM_ENABLED=false
```

When `false`, every helper checks the flag and silently no-ops. Hub keeps
running normally; AI features that depend on the audit log degrade
gracefully (proposal returned to UI but not persisted). Use this if you
need to disable platform writes immediately without touching Azure.

### Tier 2 — Lockdown (firewall off; seconds)

```powershell
node tools/ops-platform-control.mjs lockdown
```

Removes all firewall rules. The DB exists and you still pay for it (~£0/hr
when idle), but no source can connect. Useful if you suspect a
runaway-loop or want to freeze writes pending investigation. Reverse:

```powershell
node tools/ops-platform-control.mjs unlock
```

### Tier 3 — Pause (zero compute cost; seconds)

```powershell
node tools/ops-platform-control.mjs pause
```

Manually pauses the serverless DB. Compute cost = £0/hr. Storage cost
still applies (~£3/mo). Wakes automatically on next connection unless
locked down too.

```powershell
node tools/ops-platform-control.mjs resume
```

### Tier 4 — Teardown (destructive)

```powershell
node tools/ops-platform-control.mjs teardown --yes-really
```

Deletes the database AND server. Asks you to type the DB name to confirm.
Data is unrecoverable (no backup retention configured beyond the
serverless default). Key Vault secrets remain soft-deleted for 90 days.

The `operations` RG itself is **never** touched by teardown.

## Status & cost

```powershell
node tools/ops-platform-control.mjs status   # SKU, state, firewall, secrets, repo flag
node tools/ops-platform-control.mjs cost     # month-to-date cost (best-effort)
```

## Standing it up from scratch

```powershell
pwsh -File scripts/standup-helix-operations-platform.ps1
```

Idempotent — safe to re-run. Creates server, DB, firewall rules, and
stores the admin password + connection string in `Helix-Keys` vault. The
generated password is never printed.

## Hooking the Hub server up

After standup:

```powershell
# Read the connection string back from Key Vault
az keyvault secret show --vault-name Helix-Keys --name operations-sql-connection-string --query value -o tsv
```

Add to `.env`:

```
OPS_PLATFORM_ENABLED=true
OPS_SQL_CONNECTION_STRING=Server=tcp:helix-operations-sql...
```

For Azure App Service deployments, prefer a Key Vault reference:

```
OPS_SQL_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=https://helix-keys.vault.azure.net/secrets/operations-sql-connection-string/)
```

Then run the migration:

```powershell
node scripts/migrate-add-ai-proposals.mjs
```

## Promotion gates (as the platform grows)

Today: single admin user, one DB, public endpoint with firewall. Fine for
the audit/utility scope.

Promote to the next gate when any of these become true:

| Trigger | Action |
|---|---|
| First app other than Hub writes here | Create per-app SQL users with scoped grants (no admin login outside migrations) |
| MTD cost crosses £30 | Review query patterns; add indexes; consider DTU model |
| Any production outage traced to public endpoint | Move to private endpoint via Instructions vNet (DNS zones already exist there) |
| Recruitment app comes online | Add Recruitment-RG-managed-identity → SQL user mapping |
| First sensitive PII column proposed | Encryption-at-rest review; column-level encryption decision |

## Why not extend `helix-core-data` or `instructions`?

- `helix-core-data` has accreted four distinct concerns (legacy operational + cross-app shared + CCL + hub utility). Adding more to it makes the eventual cleanup harder and risks coupling new audit data to legacy schema migrations.
- `instructions` is vNet-isolated premium. Putting low-priority audit tables there means dragging a premium-tier cost model into utility work, and adding a new app to its vNet gate is a non-trivial onboarding lift.
- A separate, cheap, serverless DB lets utility data scale independently and gives a clean home for cross-app shared concerns without forcing them through either premium gate.
