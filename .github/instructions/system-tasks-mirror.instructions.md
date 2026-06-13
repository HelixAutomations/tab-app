---
applyTo: "server/utils/asanaTasksMirror*,server/routes/system-tasks*,scripts/init-asana-tasks-mirror*"
allowGlobalApplyTo: true
---

# System Tasks Hub-side mirror is privileged data

Last verified: 2026-06-04

The Hub-side mirror in `server/utils/asanaTasksMirror.js` shadows Asana task content into the Instructions DB (`OpsAsanaProjects`, `OpsAsanaSections`, `OpsAsanaTasks`) so the System Tasks bench can read from our own SQL in ~10-30ms instead of round-tripping Asana on every load. Once data lands in SQL it inherits all the same content-privilege rules as the live Asana surface; this file codifies the extra rules that apply specifically to the mirror.

The umbrella rule lives in [asana-task-content-guard.instructions.md](asana-task-content-guard.instructions.md). Read it first. This document only adds mirror-specific obligations.

## Synthetic operator

The drift sync and write-through paths in `asanaTasksMirror.js` are the only places in the codebase that may call `getTask` without a real user-initiated request. They MUST do so via the synthetic operator:

```js
const MIRROR_OPERATOR_ACTOR = 'system-tasks-mirror-sync';

await getTask({
  accessToken,
  taskGid,
  operatorConsent: true,
  operatorActor: MIRROR_OPERATOR_ACTOR,
});
```

Do NOT reuse this actor name from any other surface. Any new caller passing `'system-tasks-mirror-sync'` is a guard violation; the actor is shorthand for "the 30s drift sync timer or the write-through hook fired by a Hub mutation the operator just made".

## Logging discipline

- All `trackEvent` / `trackMetric` properties in this module are structural metadata only: `projectGid`, `taskGid`, `sectionGid`, `taskCount`, `sectionCount`, `durationMs`, `completed`, `trigger`. Never `name`, `notes`, `assigneeName`, or any string the operator did not type.
- Use `safeTaskSummary(task)` from [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js) for any per-task log line. `safeTaskSummary` returns `hasName: boolean`, never the name itself.
- Do NOT add a debug `console.log(board)` of `readBoard`'s response. The board response is the same shape the bench renders to the operator's screen; logging it is the same privacy hit as logging the live Asana response.

## SQL discipline

- Tables `OpsAsanaTasks.Name` and `OpsAsanaTasks.AssigneeName` are client-sensitive. Do not `SELECT *` and paste results into chat, scripts, or fixtures. When a debug query is needed, project structural columns only: `SELECT ProjectGid, TaskGid, SectionGid, Completed, DueOn, MirroredAt, DeletedAt FROM dbo.OpsAsanaTasks WHERE ...`.
- `OpsAsanaProjects.LastError` may contain Asana error strings; treat as low-risk but still do not paste into public-ish artifacts.

## What the mirror does NOT do

- Mirror story bodies / comments / subtasks / attachments. Phase 1 stores only the fields the board renders. If a future phase mirrors more, extend this file first.
- Mirror tasks for projects the bench has not opened. Sync runs only for projects that have been registered via `registerProject(gid)` (the bench's GET /board route does this lazily, and the default Tech & Automations project is seeded at boot).
- Run while `HELIX_LAZY_INIT=1` is set (dev:fast). The boot wiring in `server/index.js` gates `startMirrorSync()` behind the same `!skipBackground` branch as the data-ops scheduler.

## Adding a new caller

Before adding any new function to `asanaTasksMirror.js` that touches Asana or returns SQL rows from `OpsAsanaTasks`:

1. Confirm the caller is a route handler that already runs `requireDevPreview` (LZ + AC). No background helper outside this module may export task content.
2. Use `safeTaskSummary` for every log line you add.
3. Update this instruction file with the new function's name and operator actor.
