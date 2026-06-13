// server/utils/asanaContentGuard.js
//
// Hard guardrail: Asana task CONTENT (name, notes, html_notes, story text,
// subtask names, follower display names, attachment names) is treated as
// privileged client data. It must only ever be loaded in service of a
// user-initiated operator action, and it must NEVER be logged, printed,
// echoed in telemetry, written to ops.log, or returned in chat by an agent.
//
// Why redaction won't save us: task names and notes routinely contain client
// names, matter references, and legally privileged context. There is no
// reliable scrub. So we default-deny task-content reads and require the
// caller to declare an operator consent context.
//
// Callers that legitimately need task content (the bench editor's notify
// route, the operator-initiated task inspector) pass:
//
//   { operatorConsent: true, operatorActor: 'lz' | 'lz@helix-law.com' }
//
// Anything else (an ad-hoc node script, a debug helper, a "let me just
// check the task body" peek by an agent) hits the throw below and stops.
//
// The escape hatch is a single env flag, ASANA_DEV_BYPASS_TASK_GUARD=1.
// It is named loudly on purpose: any diff or shell history that flips it
// is meant to be obvious in review. Do not set it in production. Do not
// set it inside an agent run without the operator's spoken approval.

const BYPASS_ENV_FLAG = 'ASANA_DEV_BYPASS_TASK_GUARD';

class AsanaTaskContentGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AsanaTaskContentGuardError';
    this.status = 403;
  }
}

function assertOperatorReadConsent(opts, callerLabel = 'asana-task-content') {
  if (process.env[BYPASS_ENV_FLAG] === '1') return;

  const consent = opts && opts.operatorConsent === true;
  const actor = opts && typeof opts.operatorActor === 'string' && opts.operatorActor.trim();

  if (consent && actor) return;

  throw new AsanaTaskContentGuardError(
    `[${callerLabel}] Asana task content read denied. ` +
    'This function returns privileged client data (names, notes, story text). ' +
    'Pass { operatorConsent: true, operatorActor: <initials|email> } from a ' +
    'user-initiated route or operator action. Ad-hoc agent or debug calls must ' +
    `not bypass this. The only escape hatch is the env flag ${BYPASS_ENV_FLAG}=1, ` +
    'which must only be set with the operator\'s spoken approval.'
  );
}

// Returns the only representation of an Asana task that is safe to log,
// trace, echo back in chat, or paste into telemetry. Structural metadata
// only. No name, no notes, no html_notes, no assignee email, no follower
// display names, no story text.
function safeTaskSummary(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    gid: task.gid || null,
    sectionGid: task.sectionGid || null,
    projectGid: task.projectGid || null,
    assigneeGid: task.assignee?.gid || null,
    createdByGid: task.createdBy?.gid || null,
    followerCount: Array.isArray(task.followers) ? task.followers.length : 0,
    dueOn: task.dueOn || null,
    completed: Boolean(task.completed),
    hasName: Boolean(task.name && String(task.name).trim()),
    hasNotes: Boolean(task.notes && String(task.notes).trim()),
  };
}

module.exports = {
  assertOperatorReadConsent,
  safeTaskSummary,
  AsanaTaskContentGuardError,
  BYPASS_ENV_FLAG,
};
