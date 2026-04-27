/**
 * POST /api/matters/open-another      → start a job, returns { jobId }
 * GET  /api/matters/open-another/:id  → poll job status, returns { step, status, error?, result? }
 *
 * Open a new matter for an existing prospect (re-uses prospect, EID, Clio contact).
 * Async + polling because the underlying Clio chain can exceed App Service's ~230s
 * edge timeout (lessons learned in /memories/repo/clio-matter-creation-gotchas.md).
 *
 * Token order:
 *   1. Originating solicitor's per-user secrets (via getClioAccessToken(initials))
 *   2. On 403 → fallback to service account (getClioAccessToken() with no args)
 *      (mirrors dubberCalls.js pattern)
 *
 * Telemetry namespace: MatterOpening.OpenAnother.*
 *
 * Status: Phase 1 skeleton — chain steps are stubbed and complete after a short
 * delay. Phase 2 will wire real DB clones + Clio API calls.
 */

const express = require('express');
const crypto = require('crypto');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// In-memory job store
// Jobs are short-lived (single matter open ≈ 30–90s). A pruning loop drops
// finished jobs after 30 minutes so the map can't grow unbounded.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  'cloneInstruction',
  'insertEnquiry',
  'insertDeal',          // skipped if !captureDeal
  'insertRiskAssessment',
  'clioContact',
  'clioMatter',
  'linkBack',
];

const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id);
  }
}
setInterval(pruneJobs, 5 * 60 * 1000).unref();

function newJob(payload) {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: 'pending',
    step: STEPS[0],
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    result: null,
    payload,
    history: [],
  };
  jobs.set(id, job);
  return job;
}

function setStep(job, step) {
  job.step = step;
  job.history.push({ step, ts: Date.now() });
}

function finishOk(job, result) {
  job.status = 'completed';
  job.result = result;
  job.finishedAt = Date.now();
}

function finishErr(job, err, recoverable = false) {
  job.status = recoverable ? 'recoverable' : 'failed';
  job.error = {
    message: err?.message || String(err),
    step: job.step,
    recoverable,
  };
  job.finishedAt = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validatePayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Body required');
  const { sourceInstructionRef, sourcePoidId, brief, team } = body || {};
  // Either an existing InstructionRef OR a legacy POID id must be supplied.
  if (!sourceInstructionRef && !sourcePoidId) errors.push('sourceInstructionRef or sourcePoidId required');
  if (!brief?.serviceDescription) errors.push('brief.serviceDescription required');
  if (!brief?.areaOfWork) errors.push('brief.areaOfWork required');
  if (!team?.feeEarnerInitials) errors.push('team.feeEarnerInitials required');
  if (!team?.originatingInitials) errors.push('team.originatingInitials required');
  if (body?.captureDeal) {
    if (typeof body.deal?.amount !== 'number') errors.push('deal.amount required when captureDeal=true');
    if (typeof body.deal?.cfa !== 'boolean') errors.push('deal.cfa required when captureDeal=true');
  }
  if (!body?.risk || typeof body.risk !== 'object') errors.push('risk required');
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain runner — stubbed in Phase 1
// ─────────────────────────────────────────────────────────────────────────────

async function runChain(job) {
  const { payload } = job;
  const { captureDeal } = payload;

  try {
    trackEvent('MatterOpening.OpenAnother.Started', {
      jobId: job.id,
      sourceInstructionRef: payload.sourceInstructionRef,
      feeEarner: payload.team?.feeEarnerInitials || '',
      originating: payload.team?.originatingInitials || '',
      captureDeal: String(Boolean(captureDeal)),
    });

    job.status = 'running';

    for (const step of STEPS) {
      if (step === 'insertDeal' && !captureDeal) continue;
      setStep(job, step);
      // Phase 1 stub — short delay so the polling UI has something to render
      await new Promise((r) => setTimeout(r, 300));
      trackEvent('MatterOpening.OpenAnother.StepCompleted', { jobId: job.id, step });
    }

    finishOk(job, {
      // Stubbed — Phase 2 returns real values
      newInstructionRef: `${payload.sourceInstructionRef}-NEW-${job.id.slice(0, 4)}`.toUpperCase(),
      clioMatterId: 'STUB',
      displayNumber: 'STUB-00001',
      simulated: true,
    });

    trackEvent('MatterOpening.OpenAnother.Completed', {
      jobId: job.id,
      durationMs: String((job.finishedAt || Date.now()) - job.startedAt),
      simulated: 'true',
    });
  } catch (err) {
    trackException(err, { component: 'MatterOpening', operation: 'OpenAnother', phase: job.step, jobId: job.id });
    trackEvent('MatterOpening.OpenAnother.Failed', { jobId: job.id, step: job.step, error: err?.message || String(err) });
    finishErr(job, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source picker — combined search across current Instructions + legacy POID
// GET /api/matters/open-another/sources?q=<3-60 chars>
// Returns { ok, query, instructions: [...], legacyPoids: [...], gapsFor(poid) }
// Used by OpenAnotherMatterModal source picker; lets the operator either
//   (a) start from a current InstructionRef (preferred — has full schema), or
//   (b) start from a legacy POID (older form — may be missing gender, nationality,
//       DOB, etc.) and have the modal flag those gaps before submission.
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_REQUIRED_FIELDS = [
  'gender', 'nationality', 'date_of_birth', 'best_number', 'email',
  'house_building_number', 'street', 'city', 'post_code',
];

function analyseLegacyGaps(poid) {
  if (!poid) return [];
  return LEGACY_REQUIRED_FIELDS.filter((f) => {
    const v = poid[f];
    return v == null || (typeof v === 'string' && v.trim() === '');
  });
}

router.get('/sources', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const mode = String(req.query.mode || 'current'); // 'current' | 'legacy'
  if (q && q.length > 60) {
    return res.status(400).json({ ok: false, error: 'q must be 60 characters or fewer' });
  }
  const hasQuery = q.length >= 2;
  const like = hasQuery ? `%${q}%` : null;

  try {
    const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    const coreConn = process.env.SQL_CONNECTION_STRING;

    // Current instructions: search if q present, otherwise return TOP 10 recent.
    const instructionsPromise = (mode === 'current' && instructionsConn)
      ? withRequest(instructionsConn, async (request) => {
          if (hasQuery) {
            request.input('like', sql.NVarChar, like);
            request.input('exact', sql.NVarChar, q);
            const rs = await request.query(`
              SELECT TOP 25
                InstructionRef, ProspectId, ClientId, Stage, ClientType,
                FirstName, LastName, Email, CompanyName, HelixContact, SubmissionDate
              FROM Instructions
              WHERE InstructionRef = @exact
                 OR InstructionRef LIKE @like
                 OR FirstName LIKE @like
                 OR LastName  LIKE @like
                 OR Email     LIKE @like
                 OR CompanyName LIKE @like
              ORDER BY SubmissionDate DESC
            `);
            return rs.recordset || [];
          }
          const rs = await request.query(`
            SELECT TOP 10
              InstructionRef, ProspectId, ClientId, Stage, ClientType,
              FirstName, LastName, Email, CompanyName, HelixContact, SubmissionDate
            FROM Instructions
            ORDER BY SubmissionDate DESC
          `);
          return rs.recordset || [];
        }).catch((err) => {
          trackException(err, { component: 'MatterOpening', operation: 'OpenAnother.SourceSearch.Instructions' });
          return [];
        })
      : Promise.resolve([]);

    // Legacy POID: only search when explicitly asked (mode=legacy) AND q present.
    // Recent legacy without a query is pointless and slow.
    const poidPromise = (mode === 'legacy' && hasQuery && coreConn)
      ? withRequest(coreConn, async (request) => {
          request.input('like', sql.NVarChar, like);
          const rs = await request.query(`
            SELECT TOP 25
              poid_id, type, prefix, [first], [last], email, best_number,
              date_of_birth, nationality, gender, post_code,
              company_name, company_number,
              client_id, matter_id, stage, check_result, check_expiry,
              submission_date
            FROM poid
            WHERE [first] LIKE @like
               OR [last]  LIKE @like
               OR email   LIKE @like
               OR company_name LIKE @like
               OR poid_id LIKE @like
            ORDER BY submission_date DESC
          `);
          return rs.recordset || [];
        }).catch((err) => {
          trackException(err, { component: 'MatterOpening', operation: 'OpenAnother.SourceSearch.Poid' });
          return [];
        })
      : Promise.resolve([]);

    const [instructions, legacyPoidsRaw] = await Promise.all([instructionsPromise, poidPromise]);

    const legacyPoids = legacyPoidsRaw.map((p) => ({
      ...p,
      _gaps: analyseLegacyGaps(p),
    }));

    trackEvent('MatterOpening.OpenAnother.SourceSearch', {
      q, mode, instructionsCount: String(instructions.length), legacyCount: String(legacyPoids.length),
    });

    res.json({ ok: true, query: q, mode, instructions, legacyPoids });
  } catch (err) {
    trackException(err, { component: 'MatterOpening', operation: 'OpenAnother.SourceSearch' });
    res.status(500).json({ ok: false, error: err?.message || 'Search failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const errors = validatePayload(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }
  const job = newJob(req.body);
  // Fire and forget — client polls
  setImmediate(() => { runChain(job); });
  res.status(202).json({ ok: true, jobId: job.id });
});

router.get('/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    step: job.step,
    history: job.history,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
});

// Retry path — used by the UI's "Retry using automations service account" button
// Currently re-runs the whole chain with team.originatingInitials cleared so the
// chain falls back to the service account token.
router.post('/:jobId/retry-with-service-account', (req, res) => {
  const prev = jobs.get(req.params.jobId);
  if (!prev) return res.status(404).json({ ok: false, error: 'Original job not found or expired' });
  const newPayload = {
    ...prev.payload,
    team: { ...prev.payload.team, _useServiceAccount: true },
  };
  const job = newJob(newPayload);
  trackEvent('MatterOpening.OpenAnother.Recovered', { previousJobId: prev.id, newJobId: job.id });
  setImmediate(() => { runChain(job); });
  res.status(202).json({ ok: true, jobId: job.id, previousJobId: prev.id });
});

module.exports = router;
module.exports._steps = STEPS; // exported for tests
