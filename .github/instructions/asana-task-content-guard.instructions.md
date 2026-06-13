---
applyTo: "server/utils/asana*,server/routes/system-tasks*,server/operatorActions/asana*,scripts/**,tools/**"
allowGlobalApplyTo: true
---

# Asana task content is privileged

Last verified: 2026-06-03

Asana task content (name, notes, html_notes, story text, subtask names, follower display names, attachment names) routinely carries client names, matter references, and legally privileged context. There is no reliable redaction. Treat it like the SQL client tables: never paste it into chat, never write it to logs, never echo it in telemetry, never include it in an error string an agent might surface.

## Hard runtime gate (do not weaken)

The four task-content readers in `server/utils/asanaTasks.js` (`getTask`, `getTaskStories`, `getTaskSubtasks`, `inspectTask`) call `assertOperatorReadConsent` from [server/utils/asanaContentGuard.js](../../server/utils/asanaContentGuard.js). They throw unless the caller passes:

```js
{ operatorConsent: true, operatorActor: '<initials or email>' }
```

That call signature is intentional friction. A caller that supplies it is making a written claim that the call is in service of a user-initiated operator action (a route handler the operator just hit, an operator action they just ran), not an ad-hoc debug peek. Every diff that adds a new consenting call site is reviewable.

The escape hatch is the env flag `ASANA_DEV_BYPASS_TASK_GUARD=1`. Do not set it in production. Do not set it inside an agent session without the operator saying so in chat first. Do not commit any script or config that sets it.

## Agent rules (read this before touching the surface)

- Do NOT call `getTask`/`getTaskStories`/`getTaskSubtasks`/`inspectTask` from a one-off node script, a tools/* helper, or an `execution_subagent` to "verify behaviour". If you need to see the shape of the response, read the Asana REST docs or the existing fixtures. Never against live client data.
- Do NOT add `console.log(task)`, `console.log(stories)`, `JSON.stringify(task)`, or equivalent. If you need a debug line, log only what `safeTaskSummary(task)` returns: `{ gid, sectionGid, projectGid, assigneeGid, createdByGid, followerCount, dueOn, completed, hasName, hasNotes }`. Structural metadata only.
- Do NOT include task content in `trackEvent`, `trackException`, `trackMetric`, `opLog.append`, or any other telemetry payload. The existing `withAsana` wrapper in [server/routes/system-tasks.js](../../server/routes/system-tasks.js) only records `operation`, `actor`, `durationMs`, and `err.message`; keep it that way.
- Do NOT add a "show me the task" affordance to internal dashboards, dev consoles, or admin tools without the operator asking for it explicitly. The bench editor at `src/tabs/roadmap/system/board-editor/` is the only surface the operator already opted into.
- Do NOT relay task content back to the user in chat replies, even when debugging. If a route returns 500 because a task body did something unexpected, ask the operator to share the gid; do not fetch and paste the body.

## Pattern reference

```js
// ALLOWED: user-initiated route handler.
const task = await getTask({
  accessToken,
  taskGid,
  operatorConsent: true,
  operatorActor: readActorInitials(req) || readActorEmail(req) || 'unknown',
});

// ALLOWED: logging structural metadata only.
log.info('Task loaded', safeTaskSummary(task));

// DENIED: ad-hoc peek (throws AsanaTaskContentGuardError).
const task = await getTask({ accessToken, taskGid });

// DENIED: leaks content into telemetry.
trackEvent('Debug.Task', { name: task.name, notes: task.notes });

// DENIED: leaks content into ops log.
opLog.append({ kind: 'asana.task', body: task });
```

## When the guard fires

The thrown `AsanaTaskContentGuardError` carries `status: 403` and a message that names the call site. It is intentionally loud. If a legitimate new operator action needs task content, add the consent fields and add the new call site to this file's "ALLOWED" pattern reference (and to the changelog). Do not silence the guard.
