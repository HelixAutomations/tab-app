// server/operatorActions/artefactKinds.js
//
// Artefact contract for Operator Actions (B1, Phase B).
//
// An action's `run()` returns `{ summary, warnings, artefact }`. The artefact
// shape is:
//
//   {
//     kind:           'json' | 'text' | 'markdown' | 'csv',
//     body:           any (objects/arrays serialised on the wire to JSON),
//     mimeType?:      string (defaults inferred from kind),
//     downloadName?:  string (defaults to `<actionId>-<runId>.<ext>`),
//     attachableTo?:  Array<'blob' | 'asana' | 'matter' | 'prospect' | 'time-entry'>,
//   }
//
// The contract intentionally does NOT cover binary artefacts yet — Phase B.2
// will introduce `bodyBase64` for PDF/Word once the matter/prospect attach
// path is wired through NetDocuments.

const KIND_DEFAULTS = {
  json: { mimeType: 'application/json', extension: 'json' },
  text: { mimeType: 'text/plain; charset=utf-8', extension: 'txt' },
  markdown: { mimeType: 'text/markdown; charset=utf-8', extension: 'md' },
  csv: { mimeType: 'text/csv; charset=utf-8', extension: 'csv' },
};

const VALID_TARGETS = ['blob', 'asana', 'matter', 'prospect', 'time-entry'];

function describeArtefact(artefact) {
  if (!artefact || typeof artefact !== 'object') return null;
  const kind = artefact.kind && KIND_DEFAULTS[artefact.kind] ? artefact.kind : 'text';
  const defaults = KIND_DEFAULTS[kind];
  const attachable = Array.isArray(artefact.attachableTo)
    ? artefact.attachableTo.filter((t) => VALID_TARGETS.includes(t))
    : [];
  return {
    kind,
    mimeType: artefact.mimeType || defaults.mimeType,
    extension: defaults.extension,
    downloadName: artefact.downloadName || null,
    attachableTo: attachable,
  };
}

// Coerce an artefact body to a UTF-8 Buffer suitable for blob/file writes.
// JSON bodies are pretty-printed (2-space) for readability when downloaded.
function artefactBodyToBuffer(artefact) {
  if (!artefact) return Buffer.alloc(0);
  const kind = artefact.kind && KIND_DEFAULTS[artefact.kind] ? artefact.kind : 'text';
  const body = artefact.body;
  let text;
  if (kind === 'json') {
    try {
      text = JSON.stringify(body, null, 2);
    } catch {
      text = String(body);
    }
  } else if (typeof body === 'string') {
    text = body;
  } else {
    try {
      text = JSON.stringify(body, null, 2);
    } catch {
      text = String(body);
    }
  }
  return Buffer.from(text, 'utf8');
}

function artefactBodyToString(artefact) {
  return artefactBodyToBuffer(artefact).toString('utf8');
}

module.exports = {
  KIND_DEFAULTS,
  VALID_TARGETS,
  describeArtefact,
  artefactBodyToBuffer,
  artefactBodyToString,
};
