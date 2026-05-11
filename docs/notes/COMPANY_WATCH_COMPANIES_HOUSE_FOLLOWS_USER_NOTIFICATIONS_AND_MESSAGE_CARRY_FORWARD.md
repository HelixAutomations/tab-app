# Company Watch Companies House follows user notifications and message carry-forward

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-05-04 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User asked on 2026-05-03 to "scope a comprehensive implementation and stash brief for us to come back to" and then to confirm the steps needed "to follow companies and notify users/carry the message etc. forward etc". On 2026-05-04 the user clarified the core product shape: users should be able to enable Companies House alerts while opening matters, automatically for client companies where `ClientType = Company`, and optionally for company opponents. The same watch spine should later support The Gazette and other UK public notice sources.

The intent is a Companies House watch workflow for Helix: the operator can follow or watch important companies, tell the right internal users when something changes, and carry that message forward into the next operational step instead of relying on a personal inbox memory loop.

This brief is **not** asking for immediate implementation, not asking to auto-send client advice, and not asking to automate a user's Companies House login. It scopes the system we should come back to: a Hub-managed company/public-notice watchlist, official-source polling, matter-opening opt-ins, notification routing, and controlled follow-up messages. The existing deployed browser-automation function should be retired or locked down, not extended.

---

## 2. Current state - verified findings

Repo claims below are backed by fresh file reads/searches on 2026-05-04. Azure and web-source claims are called out separately with the command or reference URL needed to re-verify them.

### 2.1 Companies House exists only as a resource link / placeholder operation

- [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx#L456) - Companies House is currently just a quick-link resource pointing at the GOV.UK organisation page.
- [src/tabs/resources/ResourceCard.tsx](../../src/tabs/resources/ResourceCard.tsx#L144) - `resourceTabsMap` defines per-resource tabs; [ResourceCard.tsx](../../src/tabs/resources/ResourceCard.tsx#L156) gives Companies House only `Home` and `Company Search`.
- [src/tabs/resources/ResourceCard.tsx](../../src/tabs/resources/ResourceCard.tsx#L170) - `resourcesWithOperations` includes Asana, Clio, Azure, and NetDocuments, but not Companies House. That means the card has no real operational panel today.
- [src/app/customisation/ResourceActions.ts](../../src/app/customisation/ResourceActions.ts#L408) - the `companieshouse` action group exists, but each action is a browser `alert()` placeholder: create at [ResourceActions.ts](../../src/app/customisation/ResourceActions.ts#L414), retrieve at [ResourceActions.ts](../../src/app/customisation/ResourceActions.ts#L422), bespoke link at [ResourceActions.ts](../../src/app/customisation/ResourceActions.ts#L430), note at [ResourceActions.ts](../../src/app/customisation/ResourceActions.ts#L439).

### 2.2 A live deployed Companies House Function App exists, but it is the wrong pattern

This is an Azure operational finding from read-only inspection on 2026-05-03/2026-05-04, not a repo-backed source file. Re-run these checks before acting:

```powershell
az functionapp show --resource-group Matters --name companies-house --query "{name:name,resourceGroup:resourceGroup,location:location,state:state,hostNames:hostNames,kind:kind,httpsOnly:httpsOnly}" -o json
az functionapp function list --resource-group Matters --name companies-house --query "[].{name:name,invokeUrlTemplate:invokeUrlTemplate}" -o json
```

Verified state:

- Function App: `companies-house` in resource group `Matters`, UK West, Linux Function App, running at `companies-house.azurewebsites.net`.
- Function: `follow-company` exposed at `/api/follow-company`.
- Runtime: Python 3.11 with `azure-functions` and `pyppeteer` only.
- Trigger: anonymous HTTP, `GET` and `POST`.
- Deployed source read through the Functions admin VFS showed a Pyppeteer script that accepts `company_id`, `email`, and `password` in the request body, signs into `find-and-update.company-information.service.gov.uk`, clicks `#follow-this-company`, and confirms.
- Local repo search found no references to `follow-company`, `companies-house.azurewebsites.net`, or `find-and-update.company-information.service.gov.uk`, so Helix Hub does not appear to call it today.

Implementation consequence: do **not** build on this Function App. Phase A should disable/retire or at least lock down the anonymous endpoint and replace the pattern with official APIs, server-owned keys, and audited Hub watch rows.

### 2.3 Matter opening already captures the company data we need

- [src/tabs/instructions/Instructions.tsx](../../src/tabs/instructions/Instructions.tsx#L4178) and [Instructions.tsx](../../src/tabs/instructions/Instructions.tsx#L4179) synthesise `company_name` and `company_number` into POID data from the selected instruction.
- [src/tabs/instructions/Instructions.tsx](../../src/tabs/instructions/Instructions.tsx#L4245) passes `initialClientType` into `FlatMatterOpening`, defaulting to `Company` when a selected instruction has `CompanyName`.
- [src/tabs/instructions/MatterOpening/intakeModel.ts](../../src/tabs/instructions/MatterOpening/intakeModel.ts#L18) defines `company_details.name` and `company_details.number` on matter-opening client records.
- [src/tabs/instructions/MatterOpening/intakeModel.ts](../../src/tabs/instructions/MatterOpening/intakeModel.ts#L103) treats records with company details as company entities.
- [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx#L634) and [FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx#L654) already persist drafted opponent and solicitor company numbers.
- [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx#L1594) and [FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx#L1611) include opponent and solicitor company numbers in the matter-opening payload.
- [src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx](../../src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx#L150) has a UK company-number validator.
- [src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx](../../src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx#L1210) renders the opponent company-number field; [OpponentDetailsStep.tsx](../../src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx#L1686) renders the solicitor company-number field.
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx#L805) builds `company_details.number` for company clients from instruction data.
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx#L880) includes `opponent.company_number` in compact matter-opening payloads.
- [src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx](../../src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx#L217) seeds company number from an existing instruction, and [OpenAnotherMatterModal.tsx](../../src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx#L282) includes it in the open-another payload for company capacity.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts#L273) posts opponent details to `/api/opponents` during matter opening.
- [server/routes/opponents.js](../../server/routes/opponents.js#L138) stores opponent `CompanyNumber`; [opponents.js](../../server/routes/opponents.js#L167) stores opponent-solicitor `CompanyNumber`.

Implementation consequence: the first real product entry point should be the matter-opening flow. Resources is still the control plane, but the natural moment to create watch subscriptions is when client/opponent company numbers are already on screen.

### 2.4 Official source surfaces exist for this without user passwords

Web references verified on 2026-05-04:

- Companies House Public Data API: `https://developer.company-information.service.gov.uk/` and `https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference`.
- Useful Companies House endpoints: `GET /company/{companyNumber}`, `GET /company/{company_number}/filing-history`, `GET /company/{company_number}/officers`, `GET /company/{company_number}/charges`, `GET /company/{company_number}/insolvency`, and PSC endpoints under `/persons-with-significant-control`.
- Companies House authentication: API/stream key via HTTP Basic auth where the key is the username and password is blank. OAuth is for actions requiring end-user involvement, not for public company monitoring.
- The Gazette data: `https://www.thegazette.co.uk/data` and `https://github.com/TheGazette/DevDocs` expose linked data/documentation, SPARQL, JSON/XML/RDF-style notice representations, and a subscription data service. Gazette guidance explicitly calls out company notices including insolvency, striking off, dissolutions, reinstatements, takeovers/transfers, changes in capital structure, and property disclaimers.
- Gazette crawling must respect their rules, including a crawl delay of one request every 10 seconds and non-business-hour crawling where crawling is used. Prefer targeted linked-data/search/data-service queries over broad crawling.

Implementation consequence: model this as a source-adapter watch system (`companies-house`, `gazette`, later others), not as a Companies-House-only table or mailbox rule.

### 2.5 Notification plumbing exists, but the default DM route is Luke-only

- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js#L74) - `NOTIFICATION_TEMPLATE_LIBRARY` already feeds Team Hub notification templates into Card Lab.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js#L153) - `buildCard(type, data)` is the central Adaptive Card builder for Hub notifications.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js#L278) - `notify(type, data)` rate-limits and sends cards.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js#L288) - `notify` currently sends via `sendCardToDM(NOTIFY_EMAIL, ...)`.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js#L320) - the module exports `notify`, `buildCard`, `buildTemplateCard`, and `NOTIFICATION_TEMPLATE_LIBRARY`, so adding `company.watch.*` templates here automatically makes them available to Card Lab catalogue consumers.
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js#L24) - `ALLOWED_DM_RECIPIENTS` is currently hard-coded to `['lz@helix-law.com']`.
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js#L304) - `sendCardToDM` resolves the user and posts the card.
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js#L306) - `sendCardToDM` blocks anyone outside `ALLOWED_DM_RECIPIENTS`.
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js#L192) - `sendActivityFeedNotification` already exists as a user-targeted Teams activity-feed path.
- [server/routes/teamsNotify.js](../../server/routes/teamsNotify.js#L75) - `/api/teams-notify/activity-feed` exposes the activity-feed path and calls `sendActivityFeedNotification` at [teamsNotify.js](../../server/routes/teamsNotify.js#L83).
- [server/index.js](../../server/index.js#L769) - Teams notification routes are mounted at `/api/teams-notify`.

### 2.6 Team/user routing data is available from the team table

- [server/routes/teamData.js](../../server/routes/teamData.js#L14) - `GET /api/team-data` reads the team table.
- [server/routes/teamData.js](../../server/routes/teamData.js#L34) - the route selects `Full Name`, `Initials`, `Email`, `Entra ID`, `Role`, `AOW`, and `status` from `[dbo].[team]`.
- [server/routes/teamData.js](../../server/routes/teamData.js#L40) - anonymous bootstrap callers get only active users and a slim payload; authenticated callers get the full rowset.
- [server/utils/teamData.js](../../server/utils/teamData.js#L37) - server-side `getTeamData()` reads `dbo.team` and caches for five minutes.
- [src/app/functionality/types.ts](../../src/app/functionality/types.ts#L34) - the client `UserData` type already includes `Initials`, `Email`, `EntraID`, `Role`, `AOW`, and status-like fields suitable for watch follower selection.

### 2.7 Hub To Do is the right carry-forward spine

- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js#L2) - Hub To Do is explicitly the server-side helper over `dbo.hub_todo`.
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js#L12) - one insert lights up Home immediate actions and Activity feed.
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js#L42) - the helper is gated by `OPS_PLATFORM_ENABLED=true`.
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js#L56) - the normal operations DB connection is `OPS_SQL_CONNECTION_STRING`.
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js#L190) - `createCard` inserts into `dbo.hub_todo` with kind, owner, payload, summary, and last event.
- [server/routes/todo.js](../../server/routes/todo.js#L117) - `/api/todo/create` accepts a kind, owner initials, matter ref, payload, summary, and last event, then invalidates Home caches when a card is created.

### 2.8 Background work must preserve the local fast loop

- [server/index.js](../../server/index.js#L927) - server background work respects `HELIX_LAZY_INIT` in local dev.
- [server/index.js](../../server/index.js#L931) - `skipBackground` is true only outside production when `HELIX_LAZY_INIT=1`.
- [server/index.js](../../server/index.js#L945) - skipped background work emits `Server.Boot.LazyInit.Skipped` telemetry.
- [server/index.js](../../server/index.js#L954) - existing boot-time background services start only when not skipped. The company-watch poller must follow this same pattern.

### 2.9 Route and prod-parity check surfaces already exist

- [server/index.js](../../server/index.js#L740) through [server/index.js](../../server/index.js#L769) - this is the dense route-registration area where a new `/api/company-watch` route would be mounted.
- [server/index.js](../../server/index.js#L772) - `/api/ops-checks` is mounted immediately after `/api/ops-pulse`.
- [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js#L230) - route checks already live in a catalogue used by Activity route checks.
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js#L20) - the route serves the checks catalogue.
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js#L41) - running a check emits started/completed telemetry.
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js#L79) - failures are telemetered and pushed into ops-pulse summaries.

---

## 3. Plan

### Phase A - Safety baseline and multi-source watch data model

This phase removes the risky automation pattern and creates the durable model before any user-facing automation. It answers: which legal entity are we watching, which matter/subscription cares about it, which source produced the event, who needs to know, and where does the next action go?

| # | Change | File | Detail |
|---|--------|------|--------|
| A0 | Retire or lock down deployed browser automation | Azure Function App `companies-house` in RG `Matters` | Disable or protect the anonymous `follow-company` endpoint before exposing any replacement workflow. Do not accept Companies House account passwords in Hub, scripts, logs, or Function bodies. If historical code must be kept, archive it as a redacted note only. |
| A1 | Add operations tables | `scripts/init-company-watch-tables.mjs` (NEW) | Create normalized source-aware tables in the operations DB gated by `OPS_PLATFORM_ENABLED` / `OPS_SQL_CONNECTION_STRING`: subject, subscription, follower, event, delivery, and source checkpoint. Use company number as the durable entity key, but allow many matter-specific subscriptions per company. |
| A2 | Add storage helper | `server/utils/companyWatchStore.js` (NEW) | Parameterised SQL helper for subjects, subscriptions, followers, events, deliveries, checkpoints, and triage transitions. Mirrors `hubTodoLog` failure model for non-critical writes: telemetry and structured result, no unhandled throw from notification side-effects. |
| A3 | Add source adapter contract | `server/utils/companyWatchSources.js` (NEW) | Define a small interface shared by `companies-house`, `gazette`, and later sources: `validateSubject`, `fetchLatestEvents`, `normaliseEvent`, `classifyMateriality`, and checkpoint support. |
| A4 | Add Companies House client | `server/utils/companiesHouseClient.js` (NEW) | Reads `COMPANIES_HOUSE_API_KEY` from env/Key Vault pattern; implements company profile, filing history, insolvency, charges/officers/PSC lookups where needed; handles 404/429/5xx separately. |
| A5 | Add Gazette client shell | `server/utils/gazetteClient.js` (NEW) | Implement targeted Gazette lookup by company number/name and notice type where supported; include robots/rate-limit guardrails and a feature flag if using paid data-service credentials later. |

**Proposed DDL shape:**

```sql
CREATE TABLE dbo.company_watch_subject (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  company_number NVARCHAR(20) NOT NULL,
  company_name NVARCHAR(255) NOT NULL,
  companies_house_url NVARCHAR(500) NULL,
  company_status NVARCHAR(100) NULL,
  jurisdiction NVARCHAR(64) NULL,
  registered_office_postcode NVARCHAR(20) NULL,
  last_profile_json NVARCHAR(MAX) NULL,
  last_profile_checked_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_company_watch_subject_number UNIQUE (company_number)
);

CREATE TABLE dbo.company_watch_subscription (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  subject_id UNIQUEIDENTIFIER NOT NULL,
  matter_ref NVARCHAR(50) NULL,
  instruction_ref NVARCHAR(50) NULL,
  role NVARCHAR(32) NOT NULL, -- client | opponent | opponent_solicitor | supplier | other
  watch_reason NVARCHAR(500) NULL,
  sensitivity NVARCHAR(32) NOT NULL DEFAULT 'standard',
  owner_initials NVARCHAR(16) NOT NULL,
  default_notify_level NVARCHAR(32) NOT NULL DEFAULT 'material',
  status NVARCHAR(32) NOT NULL DEFAULT 'active',
  official_follow_status NVARCHAR(32) NOT NULL DEFAULT 'not-started',
  official_followed_by NVARCHAR(255) NULL,
  official_followed_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by NVARCHAR(255) NULL,
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_by NVARCHAR(255) NULL,
  CONSTRAINT FK_company_watch_subscription_subject FOREIGN KEY (subject_id) REFERENCES dbo.company_watch_subject(id)
);

CREATE TABLE dbo.company_watch_follower (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  subscription_id UNIQUEIDENTIFIER NOT NULL,
  initials NVARCHAR(16) NOT NULL,
  email NVARCHAR(255) NOT NULL,
  entra_id NVARCHAR(100) NULL,
  route NVARCHAR(32) NOT NULL DEFAULT 'activity-feed',
  notify_level NVARCHAR(32) NOT NULL DEFAULT 'material',
  is_owner BIT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_company_watch_follower_subscription FOREIGN KEY (subscription_id) REFERENCES dbo.company_watch_subscription(id)
);

CREATE TABLE dbo.company_watch_event (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  subject_id UNIQUEIDENTIFIER NOT NULL,
  source NVARCHAR(64) NOT NULL, -- companies-house | gazette | manual
  event_key NVARCHAR(200) NOT NULL,
  event_type NVARCHAR(100) NULL,
  event_date DATE NULL,
  title NVARCHAR(500) NULL,
  category NVARCHAR(100) NULL,
  materiality NVARCHAR(32) NOT NULL DEFAULT 'log-only',
  source_url NVARCHAR(500) NULL,
  raw_json NVARCHAR(MAX) NULL,
  triage_status NVARCHAR(32) NOT NULL DEFAULT 'new',
  triage_reason NVARCHAR(1000) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_company_watch_event UNIQUE (subject_id, source, event_key),
  CONSTRAINT FK_company_watch_event_subject FOREIGN KEY (subject_id) REFERENCES dbo.company_watch_subject(id)
);

CREATE TABLE dbo.company_watch_delivery (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  event_id UNIQUEIDENTIFIER NOT NULL,
  subscription_id UNIQUEIDENTIFIER NOT NULL,
  recipient_email NVARCHAR(255) NOT NULL,
  route NVARCHAR(32) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  activity_id NVARCHAR(255) NULL,
  error NVARCHAR(1000) NULL,
  sent_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_company_watch_delivery_event FOREIGN KEY (event_id) REFERENCES dbo.company_watch_event(id),
  CONSTRAINT FK_company_watch_delivery_subscription FOREIGN KEY (subscription_id) REFERENCES dbo.company_watch_subscription(id)
);

CREATE TABLE dbo.company_watch_source_checkpoint (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  source NVARCHAR(64) NOT NULL,
  subject_id UNIQUEIDENTIFIER NULL,
  checkpoint_key NVARCHAR(200) NOT NULL,
  checkpoint_value NVARCHAR(1000) NULL,
  last_polled_at DATETIME2 NULL,
  status NVARCHAR(32) NOT NULL DEFAULT 'active',
  last_error NVARCHAR(1000) NULL,
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_company_watch_checkpoint UNIQUE (source, subject_id, checkpoint_key)
);
```

**Phase A acceptance:**
- The deployed `companies-house/follow-company` browser automation is disabled, access-controlled, or explicitly marked as deprecated and not linked from Hub.
- A single company can have multiple matter-specific subscriptions without duplicating source events.
- Companies House and Gazette source clients can be exercised in dry-run/read-only mode without user passwords.
- Every subscription has a human owner and explicit followers.
- Official Companies House website follow, if still used manually as a belt-and-braces email, is tracked as subscription metadata rather than automated by Hub.
- SQL init script is idempotent and safe to re-run.

### Phase B - Matter-opening opt-ins and Hub Resources control surface

Create watches at the moment the data is fresh: matter opening. Resources becomes the control plane for existing watches, triage, and manual additions.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Add route | `server/routes/companyWatch.js` (NEW) | `GET /`, `POST /subscriptions`, `PATCH /subscriptions/:id`, `POST /subscriptions/:id/followers`, `DELETE /subscriptions/:id/followers/:followerId`, `POST /subscriptions/:id/manual-follow-complete`, `POST /subscriptions/from-matter-opening`, `POST /subscriptions/:id/sync`, and triage/carry-forward routes. Gate writes to admin/operations users initially, then widen matter-opening creation only where the actor owns/opens the matter. |
| B2 | Mount route | [server/index.js](../../server/index.js) | Mount at `/api/company-watch` near other operational routes. Do not place behind `/api/dev-console`; this is an operator workflow, not a dev-only tool. |
| B3 | Add client panel | `src/tabs/resources/sections/CompanyWatchPanel.tsx` (NEW) | Dense operations UI: add company by number, watchlist table, follower selector from active team users, official-follow status, last event, notify policy, and triage queue. |
| B4 | Promote Companies House operations | [src/tabs/resources/ResourceCard.tsx](../../src/tabs/resources/ResourceCard.tsx) | Add Companies House to `resourcesWithOperations` and surface a Watch tab next to Company Search. |
| B5 | Retire alert placeholders for watch actions | [src/app/customisation/ResourceActions.ts](../../src/app/customisation/ResourceActions.ts) | Replace placeholder `alert()` actions with real handlers or link them into the new panel. If `ResourceActions` is legacy-only, mark the Companies House group as deprecated and stop exposing fake actions. |
| B6 | Add client-company watch opt-in | [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx), [CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx), [OpenAnotherMatterModal.tsx](../../src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx) | When client type/capacity is `Company` and company number exists, show a compact `Monitor company filings and public notices` toggle defaulted on. Owner defaults to fee earner/requesting user; followers default to fee earner + originating/supervising where known. |
| B7 | Add opponent watch opt-in | [src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx](../../src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx) | Near the opponent company-number field, show `Monitor this opponent company` defaulted off. If enabled, require a valid company number and owner. Do not default-on opponent monitoring. |
| B8 | Carry opt-ins through payload | [src/tabs/instructions/MatterOpening/intakeModel.ts](../../src/tabs/instructions/MatterOpening/intakeModel.ts), [processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts), [openAnotherMatterApi.ts](../../src/tabs/instructions/MatterOpening/openAnotherMatterApi.ts) | Add a `company_watch_requests` array to matter-opening payload metadata with entries `{ role, companyNumber, companyName, matterRef, instructionRef, ownerInitials, followerInitials, sources, notifyLevel }`. |
| B9 | Persist subscriptions after matter record is created | [server/routes/opponents.js](../../server/routes/opponents.js), [server/routes/matterRequests.js](../../server/routes/matterRequests.js), [server/routes/openAnotherMatter.js](../../server/routes/openAnotherMatter.js), `server/routes/companyWatch.js` | The matter-opening path should call the company-watch store after the matter/instruction ref exists. If the watch insert fails, matter opening should complete and surface a retryable warning. |

**Phase B acceptance:**
- Opening a company-client matter can create a watch subscription from the matter-opening flow.
- Opponent company monitoring is opt-in and never silently enabled.
- Companies House resource has a real operations panel.
- Adding a company validates number format and persists the row.
- Followers come from active team users, not free-text email typos.
- Failed watch creation does not fail matter opening, but is visible to the operator and telemetry.
- `npx tsc --noEmit --pretty false` clean.

### Phase C - Official-source polling: Companies House and Gazette

The official Companies House follow email remains a belt-and-braces manual record if the team wants it. The Hub automation should use official public-data/source adapters for durable monitoring: Companies House for company register events and The Gazette for public notices.

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Source orchestrator | `server/utils/companyWatchSources.js` | Calls enabled adapters per subject/subscription, normalises all events into `company_watch_event`, classifies materiality, and respects each source's rate limit/checkpoint. |
| C2 | Poller | `server/utils/companyWatchPoller.js` (NEW) | Poll active subjects on a conservative schedule. Idempotently upsert unseen Companies House filings by `transaction_id`/stable filing key and Gazette notices by notice id/URL/date key. |
| C3 | Boot gating | [server/index.js](../../server/index.js#L927) | Start the poller only after hydration, skip in local dev when `HELIX_LAZY_INIT=1`, and emit `Server.Boot.CompanyWatch.{Started,Skipped,Completed,Failed}`. |
| C4 | Manual sync endpoint | `server/routes/companyWatch.js` | `POST /companies/:id/sync` for operator-triggered refresh with clear status, dependency check, and telemetry. |
| C5 | Backfill mode | `scripts/init-company-watch-tables.mjs` or `tools/company-watch-backfill.mjs` (NEW) | Optional one-off to seed current latest filing as baseline without notifying everyone. |

**Telemetry contract:**
- `CompanyWatch.Poller.Started/Completed/Failed`
- `CompanyWatch.Subject.Sync.Started/Completed/Failed`
- `CompanyWatch.Source.Sync.Started/Completed/Failed`
- `CompanyWatch.Event.Upserted`
- `CompanyWatch.Notification.Dispatch.Started/Completed/Failed`
- metrics: `CompanyWatch.Poller.Duration`, `CompanyWatch.Subject.Sync.Duration`, `CompanyWatch.Event.New.Count`, `CompanyWatch.Notification.Delivery.Count`

**Phase C acceptance:**
- Manual sync finds a known company profile and filing history.
- Manual sync can find or deliberately report no Gazette notices for the same subject, with source-specific status.
- Re-running sync does not duplicate existing events.
- Poller skips under `dev:fast` lazy init.
- 429/rate-limit responses from Companies House or Gazette are surfaced as degraded, not as silent empty results.

### Phase D - Notification routing to users

This is the user's "notify users" part. It must be useful without spam.

| # | Change | File | Detail |
|---|--------|------|--------|
| D1 | Notification templates | [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js) | Add `company.watch.added`, `company.event.detected`, `company.public-notice.detected`, `company.watch.failed`, and `company.follow.manual-required` templates to `NOTIFICATION_TEMPLATE_LIBRARY` and `buildCard`. |
| D2 | Delivery helper | `server/utils/companyWatchNotifications.js` (NEW) | Given an event, resolve followers, choose route, build cards, record `company_watch_delivery`, and never block event persistence. |
| D3 | Recipient policy | [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js#L24) | Replace hard-coded Luke-only DM allowlist with env-configured allowlist or keep DM route Luke-only and use Teams activity-feed for real users. Default recommendation: activity-feed for followers, DM only for dev/test allowlisted users. |
| D4 | Team metadata | [server/utils/teamData.js](../../server/utils/teamData.js#L37) | Use active team rows to resolve initials/email/Entra ID. Do not send to inactive users. |
| D5 | Delivery log UI | `CompanyWatchPanel.tsx` | Show sent/suppressed/failed delivery status per event so the operator can trust whether the message actually moved. |

**Default routing policy:**
- `notify_level=all`: tell followers about every new filing.
- `notify_level=material`: tell followers about insolvency, liquidation/administration, strike-off/dissolution/reinstatement, Gazette company notices, charges, officers/PSC changes, registered-office changes, company-name changes, company-status changes, overdue accounts/confirmation signals, and accounts/confirmation statements where the matter context makes them relevant; keep low-value filings in the event log only.
- Owner always gets material filings.
- Activity feed notification is the default per-user route; channel cards can be added for practice-area or operations-team summaries later.

**Phase D acceptance:**
- A seeded event creates one delivery row per follower.
- Inactive users are skipped with `status=suppressed`.
- Activity-feed sends are visible in telemetry.
- Failures do not prevent the event from being stored.

### Phase E - Carry-forward workflow

This is the user's "carry the message forward" part. The goal is not just alerting; it is turning an alert into the next controlled action.

| # | Change | File | Detail |
|---|--------|------|--------|
| E1 | Event triage states | DB + `CompanyWatchPanel.tsx` | `new -> acknowledged -> action-needed -> carried-forward -> no-action -> archived`. Each transition records initials and timestamp. |
| E2 | Create Hub To Do card | [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js) via route/helper | For material events, create `kind='company-watch'` cards for owner/followers using payload `{ source, companyNumber, companyName, role, matterRef, instructionRef, eventType, eventDate, sourceUrl, eventId, subscriptionId }`. Add `company-watch` to the known client-side kind in the implementation phase. |
| E3 | Draft internal message | `server/utils/companyWatchNotifications.js` | Generate a concise internal summary: what changed, why watched, matter/client/opponent context, who owns it, required next action, source link. Use Tasking/Management framework structure. |
| E4 | Optional client-facing draft | Future server mail helper route | Do **not** auto-send to clients. If operator chooses "draft client update", create a draft only, pressure-test via `/api/ai/pressure-test-comms`, then require human send. Coordinate with `server-mail-send-helper-extraction`. |
| E5 | Attach context to matter/instruction | Later slice | If `matter_ref` or `instruction_ref` exists, store the event link in the matter/instruction activity timeline or document workspace. This may need a follow-up stash if the target record surface is not stable. |

**Phase E acceptance:**
- A material filing can become a Home To Do item.
- Operator can mark the event `no-action` with a reason.
- Operator can create a draft internal/team message without losing the source Companies House link.
- No client-facing message is sent automatically.

### Phase F - Prod-parity checks, Activity visibility, and operator runbook

| # | Change | File | Detail |
|---|--------|------|--------|
| F1 | Ops checks | [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) and [server/routes/ops-checks.js](../../server/routes/ops-checks.js) | Add dependency-scoped checks: DB tables exist, Companies House API key present, Companies House profile probe, Gazette source probe/config status, notification route health, last poll freshness. |
| F2 | Activity/ops pulse | existing Activity panels | Surface degraded company-watch state in the same style as other operational warnings. |
| F3 | Runbook | `docs/COMPANY_WATCH_RUNBOOK.md` (NEW only if no better existing home) | Short operator runbook: manual follow, add watch, follower policy, triage statuses, what to do with Companies House email alerts. |
| F4 | Changelog | [logs/changelog.md](../../logs/changelog.md) | Add one entry per shipped phase. |

**Phase F acceptance:**
- `/api/ops-checks/catalog` includes company-watch checks.
- Manual run proves whether DB/API/notifications are actually ready.
- Activity shows stale poller or failed deliveries without terminal digging.

### Phase G - Cross-app handoff, only after the Hub workflow is stable

This is parked as a later slice. It should not mutate submodules until the user explicitly syncs/authorises submodule work.

- `instruct-pitch`: when a company client supplies company number during onboarding, offer to create or suggest a company watch in tab-app after instruction acceptance.
- `enquiry-processing-v2`: normalise early lead company numbers and pass them through as structured fields so the Hub can suggest watches.
- `tab-app`: remains the operational owner of watch state, notifications, and carry-forward tasks.

---

## 4. Step-by-step execution order

1. **A0** - Disable/lock down the deployed credential-taking `follow-company` Function App path.
2. **A1-A3** - Create normalized tables, store helper, and source adapter contract.
3. **A4-A5** - Add Companies House and Gazette source clients in read-only/dry-run mode.
4. **B1-B2** - Add and mount `/api/company-watch`.
5. **B6-B9** - Add matter-opening opt-ins and persist subscriptions after matter/open-another flows have an instruction/matter context.
6. **B3-B5** - Promote Companies House/Company Watch into a real Resources control surface and remove fake actions.
7. **C1-C5** - Add source orchestration, manual sync, poller, lazy-init gating, and baseline/backfill mode.
8. **D1-D5** - Add notification templates, routing, and delivery log.
9. **E1-E3** - Add triage and carry-forward into Hub To Do/internal message.
10. **E4-E5** - Add human-gated draft/client/matter follow-up only after the internal workflow is trusted.
11. **F1-F3** - Add prod-parity checks and operator runbook.
12. **G** - Revisit cross-app hooks once the Hub workflow has real usage.

Phases A-D are the core path. E-F make it operationally trustworthy. G is the cross-app compounding path and should not block the Hub implementation.

---

## 5. Verification checklist

**Phase A:**
- [ ] `companies-house/follow-company` is disabled/locked down or explicitly not callable anonymously.
- [ ] `node scripts/init-company-watch-tables.mjs --dry-run` prints the intended SQL and target DB without mutating.
- [ ] `node scripts/init-company-watch-tables.mjs --yes` is idempotent.
- [ ] A subject plus two subscriptions for the same company number can be inserted without duplicating source events.
- [ ] Companies House client can fetch a known public profile without user credentials.
- [ ] Gazette client can run a targeted dry-run lookup or report source unavailable/degraded with a reason.

**Phase B:**
- [ ] `GET /api/company-watch` returns active watches for an admin/ops user.
- [ ] Non-admin write attempt is rejected.
- [ ] Company-client matter opening defaults the watch toggle on when a valid company number is present.
- [ ] Opponent-company watch toggle defaults off and requires explicit selection.
- [ ] Failed watch persistence after matter opening is visible but does not block matter opening.
- [ ] Resources -> Companies House shows watchlist, followers, official follow status, and last event.
- [ ] Placeholder `alert()` actions no longer present for the exposed Companies House workflow.

**Phase C:**
- [ ] Manual sync succeeds for a known public company number.
- [ ] Manual sync reports separate Companies House and Gazette source statuses.
- [ ] Duplicate sync does not duplicate events.
- [ ] Missing/invalid company number returns a useful 404-style response.
- [ ] `HELIX_LAZY_INIT=1` skips the poller locally.
- [ ] App Insights events and metrics listed in Phase C are visible.

**Phase D:**
- [ ] Seeded material filing sends one notification per eligible follower.
- [ ] Inactive follower is suppressed and logged.
- [ ] Delivery rows show `success`, `suppressed`, or `failed`.
- [ ] Card Lab catalogue shows company-watch templates after `hubNotifier` additions.

**Phase E:**
- [ ] Material filing can create a `company-watch` Home To Do card.
- [ ] Operator can acknowledge/no-action/carry-forward with audit metadata.
- [ ] Client-facing draft path requires human confirmation and pressure test; no auto-send.

**Phase F:**
- [ ] Ops check reports DB/API/notification readiness separately.
- [ ] Stale poller or failed delivery appears in Activity/ops pulse.
- [ ] Runbook matches the implemented UI labels.

---

## 6. Open decisions (defaults proposed)

1. **Matter-opening defaults** - Default: **client company watch on by default when `ClientType = Company` and a valid company number exists; opponent company watch off by default and explicitly opt-in**. Rationale: client company monitoring is a normal risk-control default, while opponent monitoring is matter-specific judgement.
2. **Watch owner** - Default: **fee earner/requesting user owns the watch; originating/supervising users are suggested followers where known**. Rationale: ownership should follow the matter, not a central inbox.
3. **Official follow owner** - Default: **use a shared monitored mailbox/account for Companies House follows if available; otherwise the operator follows manually and records the account used**. Rationale: personal inbox follows are easy to lose during holidays/role changes.
4. **Notification route** - Default: **Teams activity-feed for followers; DM remains allowlisted until widened deliberately**. Rationale: current DM helper blocks non-Luke recipients and should not be opened broadly without audit controls.
5. **Polling interval** - Default: **Companies House every 4 hours in production, Gazette every 12 hours or overnight unless paid data-service terms support more; manual sync on demand; no polling under `HELIX_LAZY_INIT`**. Rationale: filings/notices are not second-by-second operational events, and this avoids API/noise pressure.
6. **Materiality filter** - Default: **notify on insolvency/Gazette notices, strike-off/dissolution/reinstatement, officers/PSC, registered office, charges, name/status changes, and accounts/confirmation where matter-relevant; log everything else quietly**. Rationale: all-event notifications will become noise fast.
7. **Client-facing updates** - Default: **draft-only, pressure-tested, human send**. Rationale: public filings/notices are facts, but legal meaning and client advice need fee-earner judgement.

---

## 7. Out of scope

- Auto-clicking or automating the GOV.UK Companies House follow button.
- Collecting or storing any user's Companies House username/password.
- Auto-sending client advice or client updates.
- Mutating `instruct-pitch` or `enquiry-processing-v2` in the first Hub implementation slice.
- Using a personal mailbox rule as the long-term source of truth once the Hub poller exists.
- Treating every Companies House filing as urgent.
- Broad Gazette crawling that ignores robots/rate-limit guidance.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) - mount/position the Companies House watch section.
- [src/tabs/resources/ResourceCard.tsx](../../src/tabs/resources/ResourceCard.tsx) - promote Companies House into resources with operations.
- [src/app/customisation/ResourceActions.ts](../../src/app/customisation/ResourceActions.ts) - remove or replace fake Companies House alert actions.
- `src/tabs/resources/sections/CompanyWatchPanel.tsx` (NEW) - operator watchlist, followers, events, triage, and delivery status.
- [src/app/functionality/types.ts](../../src/app/functionality/types.ts) - add any shared client types only if a separate local type file would duplicate existing `UserData` usage.
- [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx) - company-client default watch toggle and opponent watch request capture in the full matter-opening flow.
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx) - same watch request capture for compact/workbench matter opening.
- [src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx](../../src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx) - opponent-company opt-in UI near company number.
- [src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx](../../src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx) - existing-client company watch toggle for open-another matters.
- [src/tabs/instructions/MatterOpening/intakeModel.ts](../../src/tabs/instructions/MatterOpening/intakeModel.ts) - carry `company_watch_requests` through canonical matter-opening payload metadata.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) - post watch requests after matter/opponent request context exists.
- [src/tabs/instructions/MatterOpening/openAnotherMatterApi.ts](../../src/tabs/instructions/MatterOpening/openAnotherMatterApi.ts) - add watch request shape to open-another payload.

Server:
- [server/index.js](../../server/index.js) - mount `/api/company-watch` and start/skip poller after hydration.
- `server/routes/companyWatch.js` (NEW) - REST API for subjects/subscriptions, followers, manual sync, triage, and carry-forward actions.
- `server/utils/companiesHouseClient.js` (NEW) - Companies House API client.
- `server/utils/gazetteClient.js` (NEW) - Gazette linked-data/search/data-service client.
- `server/utils/companyWatchSources.js` (NEW) - source adapter orchestration and materiality classification.
- `server/utils/companyWatchStore.js` (NEW) - SQL helper over company-watch tables.
- `server/utils/companyWatchPoller.js` (NEW) - background poller and manual sync orchestration.
- `server/utils/companyWatchNotifications.js` (NEW) - card construction, recipient routing, and delivery logging.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js) - add company-watch notification templates.
- [server/utils/teamsNotificationClient.js](../../server/utils/teamsNotificationClient.js) - make recipient policy deliberate for non-Luke users or route via activity feed.
- [server/utils/teamData.js](../../server/utils/teamData.js) - active-user follower resolution.
- [server/utils/opsCheckCatalog.js](../../server/utils/opsCheckCatalog.js) - company-watch readiness checks.
- [server/routes/ops-checks.js](../../server/routes/ops-checks.js) - check route remains the execution surface if any handler wiring is needed.
- [server/utils/hubTodoLog.js](../../server/utils/hubTodoLog.js) - carry-forward cards into Home/Activity.
- [server/routes/opponents.js](../../server/routes/opponents.js) - coordinate watch subscription persistence with opponent/company-number capture.
- [server/routes/matterRequests.js](../../server/routes/matterRequests.js) - coordinate matter context for watch subscription creation.
- [server/routes/openAnotherMatter.js](../../server/routes/openAnotherMatter.js) - persist company watch requests from open-another matter flow.

Scripts / docs:
- `scripts/init-company-watch-tables.mjs` (NEW) - idempotent operations DB migration.
- `docs/COMPANY_WATCH_RUNBOOK.md` (NEW only if needed) - operator runbook after implementation.
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped implementation phase.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: company-watch-companies-house-follows-user-notifications-and-message-carry-forward
verified: 2026-05-04
branch: main
touches:
  client:
    - src/tabs/resources/Resources.tsx
    - src/tabs/resources/ResourceCard.tsx
    - src/app/customisation/ResourceActions.ts
    - src/tabs/resources/sections/CompanyWatchPanel.tsx
    - src/app/functionality/types.ts
    - src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx
    - src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx
    - src/tabs/instructions/MatterOpening/OpponentDetailsStep.tsx
    - src/tabs/instructions/MatterOpening/OpenAnotherMatterModal.tsx
    - src/tabs/instructions/MatterOpening/intakeModel.ts
    - src/tabs/instructions/MatterOpening/processingActions.ts
    - src/tabs/instructions/MatterOpening/openAnotherMatterApi.ts
  server:
    - server/index.js
    - server/routes/companyWatch.js
    - server/utils/companiesHouseClient.js
    - server/utils/gazetteClient.js
    - server/utils/companyWatchSources.js
    - server/utils/companyWatchStore.js
    - server/utils/companyWatchPoller.js
    - server/utils/companyWatchNotifications.js
    - server/utils/hubNotifier.js
    - server/utils/teamsNotificationClient.js
    - server/utils/teamData.js
    - server/utils/opsCheckCatalog.js
    - server/routes/ops-checks.js
    - server/utils/hubTodoLog.js
    - server/routes/opponents.js
    - server/routes/matterRequests.js
    - server/routes/openAnotherMatter.js
    - scripts/init-company-watch-tables.mjs
  submodules: []
depends_on:
  - server-mail-send-helper-extraction
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - clio-webhook-reconciliation-and-selective-rollout
  - forms-preflight-matrix-in-activity-tab
  - helix-software-dev-productivity-control-plane
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - resources-tab-restructure-with-templates-section
  - session-probing-activity-tab-visibility-and-persistence
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - home-todo-single-pickup-surface
  - ux-realtime-navigation-programme
  - docs-transfer-review-ccl-review-fixes
  - compactmatterwizard-split-by-wizardmode
  - demo-mode-hardening-production-presentable-end-to-end
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
conflicts_with: []
```

---

## 9. Gotchas appendix

- **The live `companies-house/follow-company` Function App is a decommission candidate.** It is anonymous browser automation that accepts a Companies House email/password in the body. Treat it as a legacy risk to remove/lock down, not as a shortcut.
- **Official follow is not the same as API watch.** Companies House's website follow service is a human account/email workflow. The Hub should record that it has been done, but automation should poll the public API and store durable events.
- **Use subject + subscription, not one row per company.** The same company can be a client in one matter and an opponent in another. Deduplicate source events at subject level, route obligations at subscription level.
- **Matter opening is the natural creation point.** Resources is the control plane, but client/opponent company numbers are already captured in matter-opening flows. Do not make the team re-key those details later.
- **Gazette is a separate source, not a Companies House field.** Gazette notices need source-specific rate limits, event keys, materiality, and citations. Do not squeeze them into `filing_description` semantics.
- **Do not widen Teams DM silently.** `sendCardToDM` currently blocks anyone except `lz@helix-law.com`. For team notifications, prefer activity feed or explicitly configurable allowlist with delivery logs.
- **Every filing is public, but not every filing is operationally material.** A quiet event log plus materiality filter prevents notification fatigue.
- **Carry-forward is the point.** If the system only sends a card and does not create a triage state or To Do option, it recreates the inbox problem in a prettier place.
- **Poller must respect `HELIX_LAZY_INIT`.** The local loop should not start extra timers/API calls during `dev:fast`.
- **Do not store secrets in watch rows.** Companies House API key belongs in env/Key Vault only; rows store public company metadata and Helix routing/audit data.
- **Use company number as the durable key.** Company names change; `company_number` should drive de-duplication, URLs, polling, and audit trails.
