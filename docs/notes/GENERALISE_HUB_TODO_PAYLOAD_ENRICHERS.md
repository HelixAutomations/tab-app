# Generalise hub_todo payload enrichers

## Why

`server/routes/todo.js` now contains a one-off read-time enricher (`enrichReviewCclCards`) that backfills `matterDisplayNumber` / `clientName` / `practiceArea` into `review-ccl` payloads from the Matters table when older rows are missing them. This was a tactical fix — the same drift will happen again the moment a second `kind` (e.g. `complaint-followup`, `ld-review`, `undertaking-request`) needs to surface fresh data on the Home card without forcing a server-side migration.

The implicit contract — "this `kind` always carries these payload keys" — is invisible until a card renders wrong on Home.

## What good looks like

1. Per-kind enricher modules under `server/routes/todoEnrichers/<kind>.js`, each exporting `async function enrich(cards): Promise<void>` (in-place mutation, best-effort, never throws).
2. A registry in `server/routes/todoEnrichers/index.js` that the `/api/todo` GET handler walks once after fetch.
3. Each enricher owns its SQL — bulk lookups keyed off whatever payload field it needs (matterId, instructionId, planInitials etc).
4. Optional but recommended: a zod schema per `kind` describing the payload contract, so server-side `createCard` can warn (not reject) when a writer omits expected keys.

## Acceptance

- [ ] `enrichReviewCclCards` lifted out of `server/routes/todo.js` into `server/routes/todoEnrichers/review-ccl.js`, behaviour unchanged.
- [ ] `server/routes/todoEnrichers/index.js` exposes a `runEnrichers(cards)` helper that fans out by `kind`.
- [ ] `/api/todo` GET handler calls `runEnrichers(cards)` once for both `scope=all` and per-owner paths.
- [ ] Stub enricher files for `complaint-followup`, `ld-review`, `undertaking-request` (no-op) so the next person sees the pattern.
- [ ] App Insights event `Todo.Registry.<Kind>.Enriched` per kind (already done for review-ccl).
- [ ] No client-side change required; same payload shape lands at Home.

## Out of scope

- Background backfill / data migration — read-time enrichment is the intentional path.
- Generalising client-side card mappers (separate brief — `Home.tsx` 7k-line refactor).

## Files / links

- `server/routes/todo.js` (current home of `enrichReviewCclCards`)
- `server/utils/hubTodoLog.js` (read paths that should NOT change)
- `src/tabs/home/Home.tsx` L6724 (review-ccl mapper — consumer of enriched payload)
- changelog 2026-04-27 entry "Review CCL cards self-heal"

## Risks

- Enrichment SQL adds latency to `/api/todo` — keep bulk + parameterised, cap at fetched-cards size.
- Any new enricher that throws would tank the whole list — wrap each enricher in its own try/catch in `runEnrichers`.

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: generalise-hub-todo-payload-enrichers                          # used in INDEX cross-refs
verified: 2026-04-27
branch: main
touches:
  client: []
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with: []              # ids that touch the same files but don't block
conflicts_with: []                # ids that mutate the same regions — will need merge
```
