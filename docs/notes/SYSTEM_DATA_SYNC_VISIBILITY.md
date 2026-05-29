# System Data Sync Visibility

> **Purpose of this document.** This is a self-contained brief that the System tab agent can pick up cold. It captures the replacement visibility surface for WIP and collected-time sync status now that repeated Teams DM cards have been retired.
>
> **How to use it.** Read the whole document once. Implement Phase A first. Phase B should follow only after Phase A is merged and the System tab still builds cleanly. Add a `logs/changelog.md` entry per shipped phase.
>
> **Verified:** 2026-05-26 against branch `main`. Re-verify file and line refs if this is picked up more than 30 days later.

---

## 1. Why This Exists

The user asked: "remove wip/collected sync reminders to luke via teams dm. to be clear, im talking about adaptive cards sent to luke notifying of upcoming syncs and things. the system works and data seems up to date. help me with a surgical removal but i dont want to remove the plumbing that enables this sending of dm cards in this autonous way."

The immediate removal has been done in [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js): the scheduler no longer imports `hubNotifier`, no longer sends `sync.upcoming`, and no longer sends `sync.completed`. The replacement should be a System tab visibility surface, not a return to scheduled DM noise.

---

## 2. Current State And Verified Findings

### 2.1 System Tab Mounting

- [src/app/App.tsx](../../src/app/App.tsx) mounts the `roadmap` tab as the visible `System` tab when `showActivityTab` is true. Key refs: L1731 and L2009-L2012.
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) gates the live monitor to the dev group, derives `opsPulse` through `useOpsPulse(showLiveMonitor)`, and keeps Forge controls to LZ/AC. Key refs: L288-L311.
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) already exposes an advanced `Sync` lens chip. Key refs: L613-L616.
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) passes `opsPulse` into `FocalSurface` and sends `opsPulse.scheduler` into the side rail. Key refs: L856-L890.

### 2.2 Existing Sync Lens

- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) renders `SyncTimelineSection` when `lens === 'sync'`. Key refs: L55-L57.
- [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) is the existing sync status panel. It reads `scheduler`, `tiers`, `mutex`, and `nextFires`. Key refs: L5-L35 and L95-L117.
- [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) still renders retired `hot`, `warm`, `cold`, and `monthly` lanes. Key refs: L119-L132. That no longer matches the server scheduler.
- [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) also still types scheduler tiers as `hot`, `warm`, `cold`, and `monthly`. Key refs: L29-L36.

### 2.3 Server Sync State

- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) now defines live scheduler tiers as `collected.currentHourly`, `collected.previousSeal`, `wip.currentHourly`, and `wip.previousSeal`. Key refs: L127-L130.
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) reports cadence through `Scheduler.Started` without a `:00` heads-up card. Key refs: L232-L244.
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) still records completions, telemetry, durations, tier lifecycle, dev status, and reconciliation refresh after successful syncs. It no longer sends a Teams completion DM. Key refs: L300-L321.
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) exposes `getSchedulerState()` for ops-pulse with the current tier shape and next-fire data. Key refs: L586-L616.
- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) emits `scheduler` snapshots through `/api/ops-pulse/snapshot` and `/api/ops-pulse/stream`. Key refs: L123-L168 and L190-L214.
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js) already exposes persisted scheduler and recent run history at `/api/data-operations/scheduler-status` and richer sync history at `/api/data-operations/sync-history`. Key refs: L3756-L3959 and L3966-L4005.

### 2.4 Teams Notification Plumbing Still Exists

- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js) still keeps notification templates for sync cards, CCL cards, matter cards, and error cards. Key refs: L74-L145.
- [server/utils/hubNotifier.js](../../server/utils/hubNotifier.js) still has the generic `notify()` path that builds an adaptive card, sends it to DM, appends an activity log row, and tracks `HubNotifier.Sent`. Key refs: L279-L320.
- Do not delete `hubNotifier` or `teamsNotificationClient` for this work. The user's request was to stop WIP/collected scheduler spam, not to remove autonomous Teams DM capability.

---

## 3. Plan

### Phase A - Repair The Existing Sync Lens

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Update scheduler types | [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) | Replace retired `hot/warm/cold/monthly` tier shape with `currentHourly/previousSeal`. Include `shuttingDown`, `tickIntervalMs`, and `idleStreak` from `getSchedulerState()`. |
| A2 | Update visual rows | [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) | Render Collected and WIP lanes as `Current month hourly` and `Previous-month seal`. Read `nextFires.collectedCurrentHourly`, `wipCurrentHourly`, `collectedPreviousSeal`, and `wipPreviousSeal`. |
| A3 | Add quiet replacement message | [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) | Add a compact status line such as `Teams DM sync cards retired. System tab is source of truth.` Keep it informational, not a toggle. |
| A4 | Improve Sync lens signal | [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) | Give the `Sync` lens a count or tone when a lane is running, failed, or timed out. Keep the default calm when all lanes are idle or completed. |

**Phase A acceptance:**
- System tab > Advanced tools > Sync shows the current scheduler lanes, not retired hot/warm/cold labels.
- Running, queued, completed, failed, and timeout states are visually legible.
- The panel makes clear that sync visibility now lives in System, while Teams DM sync cards remain retired.
- `npm run build` passes.

### Phase B - Make Sync Visibility Operationally Useful

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Add persisted recent run data | [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) | Fetch `/api/data-operations/scheduler-status` on mount and refresh on demand. Show last run, last terminal status, duration, rows touched, and trigger mode for each lane. |
| B2 | Consider ops-pulse enrichment | [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js), [server/routes/dataOperations.js](../../server/routes/dataOperations.js) | If polling feels clumsy, export a safe persisted scheduler snapshot helper from `dataOperations.js` and include it in the `scheduler` event payload. Keep payload aggregate-only. |
| B3 | Add operator action affordance | [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) | Add a refresh button for the status read. Do not add manual sync triggers here unless explicitly requested. Manual sync remains in Reports/Data Centre. |
| B4 | Surface notification policy | [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js), [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) | Optionally expose `notifications: { teamsDmSyncCards: 'disabled' }` through `getSchedulerState()` so the UI is data-driven rather than hard-coded. |

**Phase B acceptance:**
- A dev-group user can answer `did collected or WIP sync recently, what ran next, and did it work?` from System without Teams DMs or terminal checks.
- The surface is aggregate/status-only and does not expose raw client data.
- The UI still behaves when `ops-pulse` is disconnected or the scheduler-status fetch fails.
- `npm run build` passes.

---

## 4. Step-by-step Execution Order

1. Load [.github/instructions/tabs.instructions.md](../../.github/instructions/tabs.instructions.md), [.github/instructions/dev-experience.instructions.md](../../.github/instructions/dev-experience.instructions.md), and [.github/instructions/wayfinding.instructions.md](../../.github/instructions/wayfinding.instructions.md) before editing `src/tabs/roadmap/**`.
2. Update `SchedulerData` and `TierStatus` in [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) to match `getSchedulerState()`.
3. Update [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) against the new type. Keep the panel structurally stable when `scheduler` is null.
4. Update the `Sync` lens tone/count in [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) using only derived scheduler status.
5. Validate with `npm run build`. If practical, run a browser check on `System > Advanced tools > Sync` while `npm run dev:fast` is running.
6. For Phase B, choose between client fetch of `/api/data-operations/scheduler-status` and ops-pulse enrichment. Prefer client fetch first unless repeated polling creates visible UX friction.
7. Add the changelog entry only after each shipped phase validates.

---

## 5. Verification Checklist

**Phase A:**
- [ ] `npm run build` succeeds.
- [ ] `System` tab opens for a dev-group user.
- [ ] `Advanced tools > Sync` shows `Current month hourly` and `Previous-month seal` for Collected and WIP.
- [ ] Search confirms `server/utils/dataOperationsScheduler.js` still has no `sync.upcoming`, `sync.completed`, or `hubNotifier` reference.

**Phase B:**
- [ ] `/api/data-operations/scheduler-status` returns persisted tier and recent run data to an authorised user.
- [ ] System Sync panel shows last terminal status, trigger mode, row movement, and next fires without using Teams DMs.
- [ ] Failure state is visible if `scheduler-status` returns 500 or `ops-pulse` disconnects.
- [ ] App Insights events already emitted by the scheduler remain unchanged: `Scheduler.<Entity>.<Tier>.Completed`, `Scheduler.<Entity>.<Tier>.Failed`, `Scheduler.Parity.Completed`, and `Scheduler.Parity.Failed`.

---

## 6. Open Decisions

1. **Static text vs scheduler field for DM policy** - Default: add a small `notifications` object to `getSchedulerState()` in Phase B. Rationale: the UI then reports actual server policy instead of hard-coding product copy.
2. **Client fetch vs ops-pulse enrichment for persisted run history** - Default: start with a client fetch to `/api/data-operations/scheduler-status`. Rationale: the route already exists and keeps ops-pulse payloads light.
3. **Manual sync controls in System** - Default: out of scope. Rationale: the user asked for visibility in System, not another place to trigger data operations.

---

## 7. Out Of Scope

- Re-adding scheduled Teams DMs for WIP or collected syncs.
- Removing `hubNotifier`, `teamsNotificationClient`, Activity Card Lab, or non-sync autonomous DM card plumbing.
- Changing the data-ops cadence, dedup logic, mutex, reconciliation snapshot, or SQL sync logic.
- Moving Reports/Data Centre manual sync controls into System in this pass.
- Adding production runtime mutations or deploy steps.

---

## 8. File Index

Client:
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) - System tab live monitor, lenses, and Sync chip tone/count.
- [src/tabs/roadmap/parts/FocalSurface.tsx](../../src/tabs/roadmap/parts/FocalSurface.tsx) - Sync lens routing to `SyncTimelineSection`.
- [src/tabs/roadmap/parts/SyncTimelineSection.tsx](../../src/tabs/roadmap/parts/SyncTimelineSection.tsx) - Main implementation surface for the replacement status view.
- [src/tabs/roadmap/parts/ops-pulse-types.ts](../../src/tabs/roadmap/parts/ops-pulse-types.ts) - Scheduler payload types.
- [src/tabs/roadmap/hooks/useOpsPulse.ts](../../src/tabs/roadmap/hooks/useOpsPulse.ts) - SSE state hook if scheduler payload is enriched.

Server:
- [server/routes/ops-pulse.js](../../server/routes/ops-pulse.js) - Existing scheduler snapshot and SSE event source.
- [server/routes/dataOperations.js](../../server/routes/dataOperations.js) - Existing persisted scheduler-status and sync-history routes.
- [server/utils/dataOperationsScheduler.js](../../server/utils/dataOperationsScheduler.js) - Scheduler state source and optional notification policy field.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) - entry per shipped phase.

### Stash Metadata

```yaml
# Stash metadata
id: system-data-sync-visibility
verified: 2026-05-26
branch: main
touches:
  client:
    - src/tabs/roadmap/Roadmap.tsx
    - src/tabs/roadmap/parts/FocalSurface.tsx
    - src/tabs/roadmap/parts/SyncTimelineSection.tsx
    - src/tabs/roadmap/parts/ops-pulse-types.ts
    - src/tabs/roadmap/hooks/useOpsPulse.ts
  server:
    - server/routes/ops-pulse.js
    - server/routes/dataOperations.js
    - server/utils/dataOperationsScheduler.js
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - agent-suggestions-inbox-in-my-helix
  - app-wide-ux-improvement-proof-programme
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - ccl-legal-document-production-hardening
  - clio-webhook-reconciliation-and-selective-rollout
  - forms-preflight-matrix-in-activity-tab
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - helix-software-dev-productivity-control-plane
  - hub-system-errors-repair-queue
  - ppc-report-does-paid-acquisition-actually-pay
  - reporting-trust-and-ops-visibility
  - resources-tab-restructure-with-templates-section
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with: []
```

---

## 9. Gotchas Appendix

- The scheduler comments and older UI labels mention retired hot/warm/cold tiers in places. The actual live server state is `currentHourly` and `previousSeal`.
- `SyncTimelineSection.tsx` currently expects keys that do not exist on the live scheduler payload. Fixing that mismatch is the first win before adding new features.
- `logs/changelog.md` creates stash precheck noise because many briefs touch it. Include the relevant ids in `coordinates_with`, but do not treat that as a code conflict.
- Keep notification transport separate from notification policy. The Teams DM plumbing is still useful for CCL, matter, error, and future targeted cards.
