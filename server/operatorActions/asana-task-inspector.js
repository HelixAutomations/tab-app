// server/operatorActions/asana-task-inspector.js
//
// Operator action: read-only Asana task inspector.
// Accepts a task gid or any Asana task URL, returns a markdown brief plus
// the raw normalised JSON. Auth uses the requestor's per-user Asana token
// (env ASANA_ACCESS_TOKEN takes precedence if set).

const { registerAction } = require('./registry');
const { resolveAsanaAccessToken, inspectTask, extractAsanaTaskGid } = require('../utils/asanaTasks');

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildMarkdown(payload) {
  const { task, stories, subtasks, warnings } = payload;
  const lines = [];
  lines.push(`# ${task.name || '(untitled task)'}`);
  lines.push('');
  if (task.url) lines.push(`Link: ${task.url}`);
  lines.push(`Gid: ${task.gid}`);
  lines.push(`Status: ${task.completed ? `completed ${formatDate(task.completedAt)}` : 'open'}`);
  if (task.assignee) lines.push(`Assignee: ${task.assignee.name}${task.assignee.email ? ` (${task.assignee.email})` : ''}`);
  if (task.dueOn || task.dueAt) lines.push(`Due: ${formatDate(task.dueAt || task.dueOn)}`);
  if (task.startOn) lines.push(`Start: ${formatDate(task.startOn)}`);
  lines.push(`Created: ${formatDate(task.createdAt)}`);
  lines.push(`Modified: ${formatDate(task.modifiedAt)}`);

  if (task.projects.length) {
    lines.push('');
    lines.push('## Projects');
    for (const project of task.projects) {
      const membership = task.memberships.find((m) => m.project?.gid === project.gid);
      const section = membership?.section?.name;
      lines.push(`- ${project.name}${section ? ` -> ${section}` : ''}`);
    }
  }

  if (task.tags.length) {
    lines.push('');
    lines.push('## Tags');
    lines.push(task.tags.map((t) => t.name).join(', '));
  }

  if (task.customFields.length) {
    lines.push('');
    lines.push('## Custom fields');
    for (const field of task.customFields) {
      lines.push(`- ${field.name}: ${field.value}`);
    }
  }

  if (task.notes && task.notes.trim()) {
    lines.push('');
    lines.push('## Notes');
    lines.push(task.notes.trim());
  }

  if (subtasks.length) {
    lines.push('');
    lines.push(`## Subtasks (${subtasks.length})`);
    for (const sub of subtasks) {
      const flag = sub.completed ? '[x]' : '[ ]';
      const who = sub.assignee?.name ? ` (${sub.assignee.name})` : '';
      const due = sub.dueOn ? ` due ${formatDate(sub.dueOn)}` : '';
      lines.push(`- ${flag} ${sub.name}${who}${due}`);
    }
  }

  if (stories.length) {
    lines.push('');
    lines.push(`## Activity (${stories.length})`);
    for (const story of stories) {
      const who = story.createdBy?.name || 'system';
      const when = formatDate(story.createdAt);
      const text = (story.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      lines.push(`- ${when} ${who} (${story.type || 'event'}): ${text}`);
    }
  }

  if (warnings.length) {
    lines.push('');
    lines.push('## Warnings');
    for (const w of warnings) lines.push(`- ${w}`);
  }

  return lines.join('\n');
}

async function runAsanaTaskInspector({ params, requestor }) {
  const rawInput = String(params.task || '').trim();
  const taskGid = extractAsanaTaskGid(rawInput);
  if (!taskGid) {
    return {
      summary: 'Could not extract an Asana task gid from input',
      artefact: null,
      warnings: ['Pass a task gid (numeric) or any Asana task URL.'],
    };
  }

  const accessToken = await resolveAsanaAccessToken({
    initials: requestor?.initials,
    email: requestor?.email,
  });
  if (!accessToken) {
    return {
      summary: 'Unable to acquire Asana access token for requestor',
      artefact: null,
      warnings: ['No ASANA_ACCESS_TOKEN env and no OAuth refresh token found on the requestor\'s team row.'],
    };
  }

  const payload = await inspectTask({
    accessToken,
    taskGid,
    operatorConsent: true,
    operatorActor: requestor?.initials || requestor?.email || 'unknown',
  });
  const markdown = buildMarkdown(payload);
  const summary = `Asana task ${payload.task.gid}: ${payload.task.completed ? 'completed' : 'open'} - ${payload.stories.length} stories, ${payload.subtasks.length} subtasks`;

  return {
    summary,
    artefact: {
      kind: 'markdown',
      body: markdown,
      downloadName: `asana-task-${payload.task.gid}.md`,
      mimeType: 'text/markdown',
      attachableTo: ['blob', 'asana'],
      meta: { taskGid: payload.task.gid, taskUrl: payload.task.url, raw: payload },
    },
    warnings: payload.warnings,
  };
}

registerAction({
  id: 'asana-task-inspector',
  title: 'Asana task inspector',
  description: 'Read-only inspector for any Asana task by gid or URL. Returns a markdown brief plus raw JSON.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'task',
      label: 'Asana task gid or URL',
      type: 'text',
      required: true,
      placeholder: 'e.g. 1207890123456789 or https://app.asana.com/0/.../1207890123456789',
      maxLength: 400,
      redactValue: false,
    },
  ],
  run: runAsanaTaskInspector,
});

module.exports = { runAsanaTaskInspector };
