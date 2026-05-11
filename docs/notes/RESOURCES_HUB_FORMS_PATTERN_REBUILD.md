# Resources Hub Forms Pattern Rebuild

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. It scopes a Forms-aligned Resources rebuild and the small Forms cleanup needed before copying the pattern.
>
> **How to use it.** Read the whole document once. Then implement Phase A only. Phase B and onwards should be picked up only after A ships. Add a `logs/changelog.md` entry per behaviour/UI/server phase.
>
> **Verified:** 2026-05-05 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

The user wants to redo Resources to match the recently redone Forms surface, but not as a visual skin. Their direction was:

> "we are going to redo resources to match forms"
>
> "resource will actually be used not just a link hub now"
>
> "scope for bespoke actions within the resource, but gated to dev i think"

They also asked for guidance on the little pieces that make workflows and code hold together, because they are vibe-coding and miss the hidden structure. So this brief is deliberately about the spine: registry, stable IDs, launcher, detail shell, server contracts, action gating, health checks, telemetry, and operation trails.

The guiding product distinction:

- **Forms starts workflows**: submit a structured request and track its processing.
- **Resources operates systems**: inspect a connected system, open the right object, and, for dev-preview users, run a typed action with an audit trail.

This is not a request to delete every bookmark, redesign Forms again, or ship broad mutating resource actions to all users. Quick links remain, but the centre of gravity moves to operational resources.

---

## 2. Current state - verified findings

### 2.1 Resources live path is still a modal, not a first-class tab

- [src/app/App.tsx](../../src/app/App.tsx#L8) imports `ResourcesModal` directly.
- [src/app/App.tsx](../../src/app/App.tsx#L410) holds `isResourcesModalOpen` state.
- [src/app/App.tsx](../../src/app/App.tsx#L719-L724) has open/close callbacks for the modal.
- [src/app/App.tsx](../../src/app/App.tsx#L1054-L1058) toggles the modal when the Resources tab is clicked.
- [src/app/App.tsx](../../src/app/App.tsx#L1674) still declares the Resources nav item as `{ key: 'resources', text: 'Resources', disabled: true }`.
- [src/app/App.tsx](../../src/app/App.tsx#L1756-L1758) mounts `<ResourcesModal isOpen={isResourcesModalOpen} onDismiss={closeResourcesModal} />`.

Implication: a Forms-style rebuild should promote Resources to a real tab view with keep-alive state and deep-link handling, rather than continuing the disabled-tab-plus-modal pattern.

### 2.2 Current Resources modal is a hard-coded link hub with some embedded tools

- [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L449) defines hard-coded `resourceSections`.
- Sections include Core Business Tools, Legal & Research, Document & Case Management, Analytics & Development, Collaboration & HR, and Compliance & Practice at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L451-L497).
- Favourites are loaded from `resourcesFavorites` at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L442) and saved at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L577).
- `handleOpenResource` opens Teams/browser links at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L548).

Implication: preserve useful links, but move resource identity to a registry instead of local hard-coded sections.

### 2.3 Dev-only links can leak through favourites

- Dev gating starts at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L1195).
- Non-dev users filter out `Analytics & Development` at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L1196-L1198).
- Favourites are prepended without re-filtering at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L1201-L1203).

Implication: the new registry must put access rules on each resource/action and filter favourites/recents through those rules every render. Never trust old localStorage state.

### 2.4 NetDocuments workspace contents has a client/server query mismatch

- The modal calls `/netdocuments-workspace-contents?c=...&m=...` at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L772).
- A later path builds query params dynamically at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L871), but the earlier `c`/`m` call remains a broken contract.
- The server expects `clientId` and `matterKey` at [server/routes/resources-core.js](../../server/routes/resources-core.js#L393-L396), then returns 400 if either is missing at [server/routes/resources-core.js](../../server/routes/resources-core.js#L398-L399).

Implication: Phase B must fix the contract while migrating NetDocuments into the registry/detail/action model.

### 2.5 Existing server routes are useful but not shaped as a Resource Hub API

- [server/index.js](../../server/index.js#L404-L405) imports `resources-analytics` and `resources-core` routers.
- [server/index.js](../../server/index.js#L824-L825) mounts them at `/api/resources/analytics` and `/api/resources/core`.
- [server/routes/resources-core.js](../../server/routes/resources-core.js#L159) exposes Clio contact lookup.
- [server/routes/resources-core.js](../../server/routes/resources-core.js#L193) exposes Clio matter lookup.
- [server/routes/resources-core.js](../../server/routes/resources-core.js#L394) exposes NetDocuments workspace contents.
- [server/routes/resources-core.js](../../server/routes/resources-core.js#L754-L1014) exposes Asana task/team/project/section/silo/user lookups.
- [server/routes/resources-analytics.js](../../server/routes/resources-analytics.js#L72) exposes Graph user lookup.

Implication: do not throw away `resources-core`; wrap/normalise it behind a small Resource Hub contract and add telemetry/action logging.

### 2.6 There are multiple Resources implementations and storage keys

- [src/components/ResourcesSidebar.tsx](../../src/components/ResourcesSidebar.tsx#L12) imports the older [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx).
- [src/components/ResourcesSidebar.tsx](../../src/components/ResourcesSidebar.tsx#L112-L129) uses `resources-favorites` and `resources-recent` localStorage keys.
- The modal and tab implementation use `resourcesFavorites` at [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx#L442), [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx#L531), and [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx#L539).
- [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx#L1126) already has `data-helix-region="tab/resources"`, and [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx#L1143) renders `TemplatesSection`.

Implication: Phase B should consolidate to one live Resources implementation, migrate/normalise storage once, and remove or archive dormant shells after verifying no callers.

### 2.7 Templates already started moving into Resources

- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx#L3-L4) imports `ActivityCardLabPanel` and `HUB_COMMS_TEMPLATE_FAMILIES`.
- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx#L20) uses `data-helix-region="resources/templates"`.
- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx#L40-L42) hosts Notification Templates/Card Lab.
- [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts#L20-L30) defines the notification templates family.
- [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts#L72-L86) includes document request and CCL template families.

Implication: the older stash `resources-tab-restructure-with-templates-section` is partially represented in code now. This new brief supersedes it at the IA level but should preserve the Templates work.

### 2.8 Forms is the pattern to copy, but needs a small structural tidy first

- [src/app/App.tsx](../../src/app/App.tsx#L240-L241) holds `pendingFormTitle` and `pendingFocusSubmissionId` for Forms deep linking.
- [src/app/App.tsx](../../src/app/App.tsx#L1147-L1166) handles `navigateToForms` events.
- [src/app/App.tsx](../../src/app/App.tsx#L1911-L1921) passes Forms deep-link/focus props into `FormsHub`.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L8-L9) pulls process definitions and stream storage helpers.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L158-L159) gates stream affordances with `isLzOrAc` / `isAdminUser`.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L637-L647) deep-links by `initialFormTitle`.
- [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts#L56) defines overrides keyed by display title.
- [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts#L211-L218) builds `processDefinitions` from `formSections` and `overrides[form.title]`.
- [src/tabs/forms/formsData.ts](../../src/tabs/forms/formsData.ts#L19-L145) is the current Forms source of truth for sections and concrete form entries.

Implication: before modelling Resources on Forms, add stable form keys/IDs and stop relying on mutable display titles for overrides/deep links.

### 2.9 Forms has a durable process trail, but the client still blends server and local state

- [src/tabs/forms/processStreamStore.ts](../../src/tabs/forms/processStreamStore.ts#L4-L5) still owns the local stream key/event.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L138) initialises stream state from localStorage.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L376) merges incoming server items with local-only items.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx#L699-L729) checks process hub health when open.

Implication: Resources should have its own operation trail from day one instead of relying only on local recents. The trail can still use optimistic client entries, but server state must win.

### 2.10 `FormsHubCard` appears unused

- [src/tabs/forms/FormsHubCard.tsx](../../src/tabs/forms/FormsHubCard.tsx#L15) exports `FormsHubCard`.
- Search found no import/call sites outside [src/tabs/forms/FormsHubCard.tsx](../../src/tabs/forms/FormsHubCard.tsx).

Implication: remove it in Phase A if a fresh grep confirms no callers. Small deletion, low risk, improves the Forms pattern before copying it.

### 2.11 Register resources are already real operational surfaces

- [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx#L264-L300) loads L&D, undertakings, and complaints.
- [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx#L405-L560) writes register changes.
- [src/tabs/resources/registers/ComplianceWorkspace.tsx](../../src/tabs/resources/registers/ComplianceWorkspace.tsx#L184) renders `RegistersWorkspace` inside the compliance surface.

Implication: these are the prototype of "Resources actually used". They should become registry entries/detail workspaces, not remain one-off special cases.

---

## 3. Plan

### Phase A - Forms structural tidy before copying the pattern

This phase is intentionally small. It improves Forms as the source pattern without changing its user-facing concept.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | Add stable `formKey`/`id` to form items | [src/tabs/forms/formsData.ts](../../src/tabs/forms/formsData.ts), [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) | Keep display titles as labels, but make overrides, deep links, stream items, and future prefill use stable keys. |
| A2 | Migrate title-based overrides | [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) | Replace `overrides[form.title]` with `overrides[form.formKey]`. Keep a temporary fallback only if needed for backward compatibility. |
| A3 | Upgrade Forms deep-link payloads | [src/app/App.tsx](../../src/app/App.tsx), [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) | Support `{ formKey, formTitle, focusSubmissionId }`. Keep old `formTitle` support during transition. |
| A4 | Remove unused `FormsHubCard` | [src/tabs/forms/FormsHubCard.tsx](../../src/tabs/forms/FormsHubCard.tsx) | Re-grep first. Delete only if still unused. |
| A5 | Add/verify focused tests for registry/deep-link mapping | `src/tabs/forms/__tests__/` (NEW or existing) | Tests should prove stable keys map to definitions and title changes do not break deep links. |

**Phase A acceptance:**

- Forms still opens exactly as before.
- Existing `navigateToForms` events using `formTitle` still work.
- New `navigateToForms` events using `formKey` work.
- Process overrides are keyed by stable IDs, not mutable titles.
- Unused `FormsHubCard` is gone, or explicitly retained if grep finds a live caller.

### Phase B - Resource registry and Forms-style shell

Build the new live surface as `ResourcesHub`, then switch the App wiring once it is ready.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Create typed resource registry | `src/tabs/resources/resourcesData.ts` (NEW), `src/tabs/resources/resourceHubData.ts` (NEW) | Define `ResourceDefinition`, `ResourceKind`, `ResourceActionDefinition`, access rules, keywords, dependencies, routes, and detail component IDs. |
| B2 | Create `ResourcesHub` shell | `src/tabs/resources/ResourcesHub.tsx` (NEW), `src/tabs/resources/resources-tokens.css` (NEW) | Mirror Forms: left launcher/search, lane/group summary, right rail for recents/favourites/health/operation trail, detail shell when selected. |
| B3 | Promote Resources to a first-class tab | [src/app/App.tsx](../../src/app/App.tsx), [src/app/styles/CustomTabs.tsx](../../src/app/styles/CustomTabs.tsx) | Remove disabled modal behaviour, mount `ResourcesHub` like Forms, preserve tab icon, add deep-link event `navigateToResources`. |
| B4 | Move legacy modal content behind registry entries | [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx), [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) | Start by rendering existing links/detail tools through the registry. Do not rewrite every workspace in one go. |
| B5 | Consolidate favourites/recents storage | `src/tabs/resources/resourceHubStore.ts` (NEW) | Use one key namespace, apply access filtering every read, and migrate old `resourcesFavorites`, `resources-favorites`, `resources-recent` once. |
| B6 | Preserve Templates and registers as first-class resources | [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx), [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts), [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx) | Templates, Compliance, Registers, Clio, NetDocuments, Asana, Graph/Azure, and Quick Links become registry entries with detail routes/actions. |

**Phase B acceptance:**

- Clicking Resources opens a full tab, not a modal.
- Search can find links, templates, registers, and system connectors by title/keyword.
- Selecting a resource opens an in-app detail shell where available, or a clear external-open action where not.
- Favourites/recents do not show dev-only items to non-dev users, even if stale localStorage contains them.
- Old Resources modal/sidebar are either deleted or reduced to compatibility shims with no separate source of truth.

### Phase C - Resource Hub server contract, health, and operation trail

Add a small API layer that turns scattered resource routes into a coherent Resource Hub surface.

#### C1. Resource health contract

New route: `server/routes/resourceHub.js` mounted at `/api/resource-hub`.

Response shape for `GET /api/resource-hub/health`:

```ts
type ResourceHealthResponse = {
  checkedAt: string;
  fromCache: boolean;
  resources: Array<{
    resourceId: string;
    status: 'ok' | 'warn' | 'fail' | 'skip';
    latencyMs?: number;
    detail?: string;
    dependencies: Array<{ id: string; status: 'ok' | 'warn' | 'fail' | 'skip'; detail?: string }>;
  }>;
  summary: { ok: number; warn: number; fail: number; skip: number };
};
```

Probe examples:

- Clio: token presence/refresh capability and a read-only lightweight call.
- NetDocuments: service credentials present and `/user` or workspace metadata probe.
- Asana: users/me or current lightweight helper call.
- Graph/Azure: token acquisition and graph-user route readiness.
- Registers: route + SQL read on the relevant register tables.

Every probe must be read-only.

#### C2. Resource operation trail

New helper: `server/utils/resourceActionLog.js`.

Suggested table: `dbo.resource_operations` in the Core Data DB.

```sql
CREATE TABLE dbo.resource_operations (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  resource_id NVARCHAR(80) NOT NULL,
  action_id NVARCHAR(80) NOT NULL,
  actor_initials NVARCHAR(16) NOT NULL,
  status NVARCHAR(32) NOT NULL,
  summary NVARCHAR(400) NULL,
  input_json NVARCHAR(MAX) NULL,
  output_json NVARCHAR(MAX) NULL,
  error NVARCHAR(MAX) NULL,
  started_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  completed_at DATETIME2(3) NULL,
  dev_preview BIT NOT NULL DEFAULT 0
);
```

Expose:

- `GET /api/resource-hub/operations?limit=24`
- `GET /api/resource-hub/operations/:id`
- `POST /api/resource-hub/actions/:resourceId/:actionId`

#### C3. Telemetry

Emit App Insights events per server-side process rules:

- `ResourceHub.Health.Started`
- `ResourceHub.Health.Completed`
- `ResourceHub.Health.Failed`
- `ResourceHub.Action.Started`
- `ResourceHub.Action.Completed`
- `ResourceHub.Action.Failed` + `trackException`
- Metric: `ResourceHub.Action.Duration`

### Phase D - Dev-preview bespoke actions

Start narrow. Every action must be typed, confirmed, logged, and dev-gated until promoted.

| Resource | Initial actions | Gate |
|----------|-----------------|------|
| NetDocuments workspace | Find workspace contents, open folder/document, copy canonical workspace ref | Read visible to admins; mutation none in Phase D |
| Clio matter/contact | Resolve matter/contact by ID/ref, copy canonical URLs, surface missing-token diagnostics | Read visible to admins/dev owner depending data scope |
| Asana task/project | Inspect task/project, copy URL, list project sections/silos | Read visible to admins |
| Graph/Azure user | Lookup user, copy UPN/object id, show route health | Dev preview for now |
| Templates | Open Card Lab, show comms registry, show source files | Admin read; dev preview for send/test actions |
| Registers/Compliance | Open registers, quick CSV copy/export, route to relevant Forms by `formKey` | Admin read; mutating actions remain existing register forms |

Use the tier rules from [src/app/admin.ts](../../src/app/admin.ts):

- Feature gating: `isAdminUser()`.
- Dev-preview work-in-progress controls: inline LZ/AC check or existing `isLzOrAc` equivalent.
- Data-scope override: `isDevOwner()` only where loading all data, not for showing buttons.

### Phase E - Progressive cleanup and deletion

After the new tab is live:

1. Delete `ResourcesModal` if no callers remain.
2. Delete `ResourcesSidebar` if no callers remain.
3. Decide whether old [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) is replaced by `ResourcesHub` or becomes a small compatibility export.
4. Delete unmounted server route files only after verifying [server/index.js](../../server/index.js) and all imports.
5. Update old stash `resources-tab-restructure-with-templates-section`: close it if this brief subsumes it, or edit it down to a Templates-only dependency.

---

## 4. Step-by-step execution order

1. **A1-A3** - Add stable Forms keys and backwards-compatible deep links.
2. **A4-A5** - Remove unused `FormsHubCard` if still unused, then add mapping tests.
3. **B1-B2** - Add Resources registry and `ResourcesHub` shell behind a local feature flag or dev preview gate.
4. **B3** - Wire Resources as a real tab while keeping the modal as fallback until acceptance passes.
5. **B4-B6** - Migrate links, templates, registers, Clio, NetDocuments, Asana, and Graph/Azure into registry entries.
6. **C1** - Add resource health route and UI rail.
7. **C2-C3** - Add operation trail + telemetry.
8. **D** - Add the first dev-preview typed actions, one connector at a time.
9. **E** - Delete dormant modal/sidebar/duplicate route code once grep and manual checks prove they are unused.

Each phase should be independently shippable and get its own changelog entry if it changes UI/server behaviour.

---

## 5. Verification checklist

**Phase A:**

- [ ] `npm test -- --runInBand` or focused Jest tests for Forms registry/deep-link mapping pass.
- [ ] Existing Forms open by title from old `navigateToForms` payloads.
- [ ] Forms open by stable `formKey` from new payloads.
- [ ] `FormsHubCard` is deleted only if grep confirms no callers.

**Phase B:**

- [ ] Resources tab is enabled and opens a full-tab `ResourcesHub`.
- [ ] Modal no longer opens from the tab strip, or is only reachable through an explicit fallback/dev affordance.
- [ ] Search finds at least: Templates, Registers, Compliance, Clio matter, NetDocuments workspace, Asana task, Graph user, and Quick Links.
- [ ] Favourites/recents persist across refresh and are filtered by access rules.
- [ ] Non-dev user cannot see dev-preview resources/actions through stale favourite data.
- [ ] NetDocuments workspace contents uses `clientId` and `matterKey`, not `c`/`m`.
- [ ] `data-helix-region` exists on launcher, detail shell, health rail, and action tray.

**Phase C:**

- [ ] `GET /api/resource-hub/health` returns the health response contract.
- [ ] `GET /api/resource-hub/operations?limit=24` returns recent operation rows.
- [ ] Failed resource action records both operation row and App Insights exception/event.
- [ ] App Insights events visible: `ResourceHub.Health.Started/Completed/Failed`, `ResourceHub.Action.Started/Completed/Failed`.

**Phase D:**

- [ ] Dev-preview actions hidden for normal users and visible to LZ/AC only.
- [ ] Each action has typed input validation, confirmation if mutating, operation trail row, and toast feedback.
- [ ] Read-only actions create no external side effects.

**Phase E:**

- [ ] Grep confirms no live callers before deleting modal/sidebar files.
- [ ] Old localStorage keys are migrated once and ignored afterwards.
- [ ] Old `resources-tab-restructure-with-templates-section` stash is closed or reduced to a dependency.

---

## 6. Open decisions (defaults proposed)

1. **First live Resource Hub host** - Default: **new `ResourcesHub` component mounted as the tab**, with the modal retained temporarily only as a fallback during migration. Rationale: avoids doing invasive surgery inside the 2,000-line modal while preserving rollback.
2. **Default lanes/groups** - Default: **Templates, Compliance & Registers, Matter Systems, Documents, Work Management, People & Access, Quick Links, Dev Tools**. Rationale: describes work users perform, not vendor names.
3. **Dev action scope** - Default: **read-only first, mutating actions LZ/AC only until proven**. Rationale: Resource actions touch external systems and should earn wider release.
4. **Operation log storage** - Default: **Core Data DB table `resource_operations`**, separate from `form_submissions`. Rationale: forms and resources are siblings, not the same lifecycle.
5. **What to do with the old Templates stash** - Default: **mark as superseded after Phase B preserves Templates in the new registry**. Rationale: this brief is broader and fresher, but the template-specific details remain valuable until carried across.

---

## 7. Out of scope

- Production deploy or production runtime mutation.
- Submodule changes.
- Rewriting Forms visuals beyond the stable-key tidy.
- Replacing Forms process hub/submission persistence.
- Exposing mutating resource actions to all users.
- Editing prompts/templates directly from Resources.
- Rewriting register CRUD unless needed to mount it cleanly inside the Resources registry.
- Adding Activity preflight matrix work; coordinate with that stash instead.

---

## 8. File index (single source of truth)

Client:

- [src/app/App.tsx](../../src/app/App.tsx) - tab wiring, modal removal, Forms/Resources deep-link events.
- [src/app/styles/CustomTabs.tsx](../../src/app/styles/CustomTabs.tsx) - Resources tab enabled behaviour/icon click semantics.
- [src/tabs/forms/formsData.ts](../../src/tabs/forms/formsData.ts) - stable form keys.
- [src/tabs/forms/processHubData.ts](../../src/tabs/forms/processHubData.ts) - form-keyed process overrides and stream identity.
- [src/tabs/forms/FormsHub.tsx](../../src/tabs/forms/FormsHub.tsx) - backwards-compatible key/title deep-link handling.
- [src/tabs/forms/forms-tokens.css](../../src/tabs/forms/forms-tokens.css) - only if Phase A tests reveal layout/state polish is needed.
- [src/tabs/forms/FormsHubCard.tsx](../../src/tabs/forms/FormsHubCard.tsx) - delete if still unused.
- [src/tabs/resources/ResourcesHub.tsx](../../src/tabs/resources/ResourcesHub.tsx) (NEW) - main full-tab Resources shell.
- [src/tabs/resources/resourcesData.ts](../../src/tabs/resources/resourcesData.ts) (NEW) - registry of concrete resources.
- [src/tabs/resources/resourceHubData.ts](../../src/tabs/resources/resourceHubData.ts) (NEW) - types, lanes, status metadata, action definitions.
- [src/tabs/resources/resourceHubStore.ts](../../src/tabs/resources/resourceHubStore.ts) (NEW) - favourites/recents/operation optimistic cache.
- [src/tabs/resources/resources-tokens.css](../../src/tabs/resources/resources-tokens.css) (NEW) - Forms-like Resources visual contract using Helix tokens.
- [src/tabs/resources/Resources.tsx](../../src/tabs/resources/Resources.tsx) - legacy tab implementation to migrate or replace.
- [src/tabs/resources/sections/TemplatesSection.tsx](../../src/tabs/resources/sections/TemplatesSection.tsx) - preserve as Templates resource detail.
- [src/tabs/resources/templatesRegistry.ts](../../src/tabs/resources/templatesRegistry.ts) - preserve/extend as template registry entry source.
- [src/tabs/resources/registers/RegistersWorkspace.tsx](../../src/tabs/resources/registers/RegistersWorkspace.tsx) - preserve as Compliance/Register resource detail.
- [src/components/ResourcesModal.tsx](../../src/components/ResourcesModal.tsx) - migrate out of and delete/reduce after new hub is live.
- [src/components/ResourcesSidebar.tsx](../../src/components/ResourcesSidebar.tsx) - verify unused and delete after migration.

Server:

- [server/index.js](../../server/index.js) - mount new `resourceHub` route.
- [server/routes/resourceHub.js](../../server/routes/resourceHub.js) (NEW) - health, actions, operations API.
- [server/utils/resourceActionLog.js](../../server/utils/resourceActionLog.js) (NEW) - operation trail helper + telemetry wrapping.
- [server/routes/resources-core.js](../../server/routes/resources-core.js) - existing connector routes to wrap/fix, especially NetDocuments query params.
- [server/routes/resources-analytics.js](../../server/routes/resources-analytics.js) - Graph/Azure lookup to surface through registry.
- [server/routes/resources.js](../../server/routes/resources.js) - verify unmounted/obsolete before deleting or leaving alone.

Scripts / docs:

- `scripts/migrate-add-resource-operations.mjs` (NEW) - creates `dbo.resource_operations` if Phase C uses SQL storage.
- [logs/changelog.md](../../logs/changelog.md) - entry per UI/server behaviour phase.
- [docs/notes/RESOURCES_TAB_RESTRUCTURE_WITH_TEMPLATES_SECTION.md](RESOURCES_TAB_RESTRUCTURE_WITH_TEMPLATES_SECTION.md) - older related brief to reconcile/close once this one ships.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: resources-hub-forms-pattern-rebuild
verified: 2026-05-05
branch: main
touches:
  client:
    - src/app/App.tsx
    - src/app/styles/CustomTabs.tsx
    - src/tabs/forms/FormsHub.tsx
    - src/tabs/forms/formsData.ts
    - src/tabs/forms/processHubData.ts
    - src/tabs/forms/forms-tokens.css
    - src/tabs/forms/FormsHubCard.tsx
    - src/tabs/resources/Resources.tsx
    - src/tabs/resources/ResourcesHub.tsx
    - src/tabs/resources/resourcesData.ts
    - src/tabs/resources/resourceHubData.ts
    - src/tabs/resources/resourceHubStore.ts
    - src/tabs/resources/resources-tokens.css
    - src/tabs/resources/sections/TemplatesSection.tsx
    - src/tabs/resources/templatesRegistry.ts
    - src/tabs/resources/registers/RegistersWorkspace.tsx
    - src/components/ResourcesModal.tsx
    - src/components/ResourcesSidebar.tsx
  server:
    - server/index.js
    - server/routes/resources-core.js
    - server/routes/resources-analytics.js
    - server/routes/resources.js
    - server/routes/resourceHub.js
    - server/utils/resourceActionLog.js
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - chat-tab-removal-retain-infra
  - clio-webhook-reconciliation-and-selective-rollout
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - demo-mode-hardening-production-presentable-end-to-end
  - forms-ia-ld-undertaking-complaint-flow
  - forms-preflight-matrix-in-activity-tab
  - helix-software-dev-productivity-control-plane
  - home-animation-order-and-demo-insert-fidelity
  - home-todo-single-pickup-surface
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - management-dashboard-trust-gate
  - realtime-multi-replica-safety
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - session-probing-activity-tab-visibility-and-persistence
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
conflicts_with:
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-stream-persistence
  - resources-tab-restructure-with-templates-section
```

---

## 9. Gotchas appendix

- Do not copy Forms only visually. Copy the structural spine: registry -> search/launcher -> detail shell -> health -> stream/trail -> deep links -> tests.
- `ResourcesModal` currently filters dev sections after reading favourites. The new implementation must filter persisted favourites/recents by access on every render.
- The NetDocuments workspace contents mismatch is real: client `c`/`m`, server `clientId`/`matterKey`. Fix this before making NetDocuments a headline resource.
- Old Resources implementations use different localStorage keys. Treat localStorage as untrusted migration input, not source of truth.
- Templates already moved partway into Resources. Preserve `TemplatesSection`/`templatesRegistry` and avoid rebuilding that work from scratch.
- `isAdminUser()` is for feature access, `isDevOwner()` is for data-scope override, and dev preview is LZ/AC. Do not widen data loads just because a button is admin-visible.
- Route health and action logs are part of the UX, not a nice-to-have. The user explicitly wants the hidden pipework surfaced so they can trust the system.
- Resource actions should have a typed `actionId`, typed input, explicit server handler, telemetry, and operation row. Avoid generic "run arbitrary action" plumbing.
- Keep the first mutating Resources actions boring and reversible. Read-only inspections give most of the value while the new shell beds in.
