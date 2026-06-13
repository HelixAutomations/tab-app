// server/utils/clioTaskOnMatter.js
//
// Helper for the Hub-native task intake processor (Phase B).
// Given a matter label/number and an assignee, finds the matter in Clio
// and creates a task on it, returning the new clio task id.
//
// Mirrors the behaviour of tasking-v3 RedirectIndividual.cs Clio leg
// (find matter by display_number, POST /api/v4/tasks). Soft-fails: returns
// { skipped: true, reason } when no matter label, when the matter cannot
// be resolved, or when the assignee has no Clio user id. The caller logs
// the outcome as a state transition; an unresolved matter is not fatal.

const { fetchClioWithRetry } = require('./clio-per-user-token');

const CLIO_API_BASE = 'https://eu.app.clio.com/api/v4';

function _trim(value, max) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

async function findMatterByDisplayNumber({ assignorInitials, displayNumber }) {
  const url = `${CLIO_API_BASE}/matters?display_number=${encodeURIComponent(displayNumber)}&fields=id,display_number,description`;
  const resp = await fetchClioWithRetry(assignorInitials, url);
  if (!resp.ok) {
    const err = new Error(`Clio matter lookup ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const payload = await resp.json();
  const matter = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!matter || !matter.id) return null;
  return { matterId: String(matter.id), displayNumber: matter.display_number || displayNumber };
}

/**
 * Create a Clio task on a matter for a given assignee.
 *
 * @param {object} args
 * @param {string} args.assignorInitials  Initials whose per-user Clio token is used to authenticate.
 * @param {string|null} args.matterLabel  Display number / matter reference. If empty/null, the leg is skipped.
 * @param {string|null} args.assigneeClioId  Numeric Clio user id of the assignee. If null, the leg is skipped.
 * @param {string} args.taskName  Task name (required).
 * @param {string} [args.description]  Optional task description.
 * @param {string} [args.dueAt]  ISO date 'YYYY-MM-DD' optional.
 * @param {string} [args.priority]  'low'|'normal'|'high'|'urgent' optional.
 * @returns {Promise<{ clioTaskId: string, matterId: string, matterDisplayNumber: string } | { skipped: true, reason: string }>}
 */
async function createClioTaskOnMatter({
  assignorInitials,
  matterLabel,
  assigneeClioId,
  taskName,
  description,
  dueAt,
  priority,
}) {
  const label = _trim(matterLabel, 256);
  if (!label) return { skipped: true, reason: 'no_matter_label' };
  if (!assigneeClioId) return { skipped: true, reason: 'assignee_no_clio_id' };
  if (!assignorInitials) return { skipped: true, reason: 'no_assignor_initials' };
  const name = _trim(taskName, 200);
  if (!name) return { skipped: true, reason: 'no_task_name' };

  const matter = await findMatterByDisplayNumber({ assignorInitials, displayNumber: label });
  if (!matter) return { skipped: true, reason: 'matter_not_found' };

  const body = {
    data: {
      name,
      description: _trim(description, 8000),
      due_at: dueAt && /^\d{4}-\d{2}-\d{2}$/.test(dueAt) ? dueAt : undefined,
      priority: ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : undefined,
      assignee: { id: Number(assigneeClioId), type: 'User' },
      matter: { id: Number(matter.matterId) },
    },
  };

  const resp = await fetchClioWithRetry(assignorInitials, `${CLIO_API_BASE}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Clio task create ${resp.status}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  const payload = await resp.json();
  const clioTaskId = payload?.data?.id != null ? String(payload.data.id) : null;
  if (!clioTaskId) throw new Error('Clio task create returned no id');
  return { clioTaskId, matterId: matter.matterId, matterDisplayNumber: matter.displayNumber };
}

module.exports = { createClioTaskOnMatter };
