/**
 * Registers Routes
 *
 * Consolidated CRUD for compliance registers:
 *   - Learning & Development (plans + activities)
 *   - Undertakings
 *   - Complaints
 *
 * Visibility: LZ, AC, JW see all records. Everyone else sees only their own.
 *
 * GET  /api/registers/learning-dev          - list plans (+ nested activities)
 * POST /api/registers/learning-dev          - create plan
 * POST /api/registers/learning-dev/activity - create activity
 * PUT  /api/registers/learning-dev/activity/:id - update activity
 * DELETE /api/registers/learning-dev/activity/:id - delete activity
 *
 * GET  /api/registers/undertakings          - list undertakings
 * POST /api/registers/undertakings          - create undertaking
 * PUT  /api/registers/undertakings/:id      - update undertaking
 *
 * GET  /api/registers/complaints            - list complaints
 * POST /api/registers/complaints            - create complaint
 * PUT  /api/registers/complaints/:id        - update complaint
 */

const express = require('express');
const { sql, withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');
const { deleteCachePattern } = require('../utils/redisClient');
const {
  createCard: createHubTodoCard,
  reconcileAllByRef: reconcileHubTodoByRef,
} = require('../utils/hubTodoLog');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');

const router = express.Router();
const TODO_APPROVER_INITIALS = 'AC';

const getConnectionString = () => {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  return connStr;
};

// Keep this aligned with src/app/admin.ts feature-access admins.
const ADMIN_INITIALS = new Set(['LZ', 'AC', 'KW', 'JW', 'LA', 'EA']);

function isAdmin(initials) {
  return ADMIN_INITIALS.has((initials || '').toUpperCase());
}

function resolveActorInitials(req) {
  const authenticatedInitials = String(req.user?.initials || '').trim().toUpperCase();
  if (authenticatedInitials) return authenticatedInitials;

  if (process.env.NODE_ENV !== 'production') {
    const fallbackInitials = req.query.initials || req.body?.initials || req.headers['x-helix-initials'];
    return String(fallbackInitials || '').trim().toUpperCase();
  }

  return '';
}

function requireInitials(req, res, next) {
  const initials = resolveActorInitials(req);
  if (!initials || initials.length < 2 || initials.length > 10) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid initials parameter' });
  }
  req.userInitials = initials;
  req.isAdmin = isAdmin(initials);
  next();
}

async function invalidateHomeJourneyCache() {
  try {
    await deleteCachePattern('home-journey:*');
  } catch (err) {
    trackException(err, { phase: 'registers.invalidateHomeJourneyCache' });
  }
}

async function createRegisterTodoCard(card) {
  const result = await createHubTodoCard(card);
  if (result.id) {
    await invalidateHomeJourneyCache();
  }
  return result;
}

async function reconcileRegisterTodoCard({ kind, matterRef, completedVia, lastEvent }) {
  const result = await reconcileHubTodoByRef({ kind, matterRef, completedVia, lastEvent });
  if (result.count > 0) {
    await invalidateHomeJourneyCache();
  }
  return result;
}

function buildLdTodoRef(activityId) {
  return `ld-activity:${activityId}`;
}

function buildUndertakingTodoRef(undertakingId) {
  return `undertaking:${undertakingId}`;
}

function buildComplaintTodoRef(complaintId) {
  return `complaint:${complaintId}`;
}

function buildComplaintSlaDeadline(receivedDate) {
  const parsed = new Date(receivedDate);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 56);
  return parsed.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// LEARNING & DEVELOPMENT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/learning-dev', requireInitials, async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const result = await withRequest(getConnectionString(), async (request) => {
      request.input('year', sql.Int, year);

      let planQuery = `
        SELECT p.*, 
          (SELECT COALESCE(SUM(a.hours), 0) FROM learning_dev_activities a WHERE a.plan_id = p.id) AS total_hours
        FROM learning_dev_plans p
        WHERE p.year = @year
      `;

      if (!req.isAdmin) {
        request.input('initials', sql.NVarChar, req.userInitials);
        planQuery += ` AND p.initials = @initials`;
      }

      planQuery += ` ORDER BY p.full_name`;

      const plans = await request.query(planQuery);
      return plans.recordset;
    });

    // Fetch activities for each plan
    const plansWithActivities = await Promise.all(
      result.map(async (plan) => {
        const activities = await withRequest(getConnectionString(), async (request) => {
          request.input('planId', sql.Int, plan.id);
          const actResult = await request.query(`
            SELECT * FROM learning_dev_activities
            WHERE plan_id = @planId
            ORDER BY activity_date DESC
          `);
          return actResult.recordset;
        });
        return { ...plan, activities };
      })
    );

    trackEvent('Registers.LearningDev.Listed', {
      year: String(year),
      initiatedBy: req.userInitials,
      planCount: String(plansWithActivities.length),
    });

    res.json({ ok: true, plans: plansWithActivities });
  } catch (err) {
    trackException(err, { operation: 'Registers.LearningDev.List', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev list error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to load L&D plans' });
  }
});

router.post('/learning-dev', requireInitials, async (req, res) => {
  let submissionId = null;
  try {
    const { target_initials, full_name, year, target_hours, notes } = req.body;
    const planInitials = (target_initials || '').toUpperCase();

    if (!planInitials || !full_name || !year) {
      return res.status(400).json({ ok: false, error: 'target_initials, full_name, and year are required' });
    }

    // Only admins can create plans for others
    if (planInitials !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'You can only create plans for yourself' });
    }

    submissionId = await recordSubmission({
      formKey: 'learning-dev-plan',
      submittedBy: req.userInitials,
      lane: 'Log',
      payload: req.body,
      summary: `L&D plan ${year} — ${full_name}`.slice(0, 400),
    });

    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('initials', sql.NVarChar, planInitials)
        .input('full_name', sql.NVarChar, full_name)
        .input('year', sql.Int, year)
        .input('target_hours', sql.Decimal(6, 2), target_hours || 16)
        .input('notes', sql.NVarChar, notes || null)
        .input('created_by', sql.NVarChar, req.userInitials)
        .query(`
          INSERT INTO learning_dev_plans (initials, full_name, year, target_hours, notes, created_by)
          OUTPUT INSERTED.*
          VALUES (@initials, @full_name, @year, @target_hours, @notes, @created_by)
        `);
      return result.recordset[0];
    });

    await recordStep(submissionId, {
      name: 'learning_dev_plans.insert',
      status: 'success',
      output: { id: record.id },
    });
    await markComplete(submissionId, { lastEvent: 'L&D plan created' });

    trackEvent('Registers.LearningDev.PlanCreated', {
      planId: String(record.id),
      forUser: planInitials,
      year: String(year),
      createdBy: req.userInitials,
    });

    res.status(201).json({ ok: true, plan: record });
  } catch (err) {
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'learning_dev_plans.insert:failed', error: err });
    }
    if (err.message?.includes('UQ_ldp_person_year')) {
      return res.status(409).json({ ok: false, error: 'A plan already exists for this person and year' });
    }
    trackException(err, { operation: 'Registers.LearningDev.CreatePlan', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev create plan error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to create L&D plan' });
  }
});

router.post('/learning-dev/activity', requireInitials, async (req, res) => {
  let submissionId = null;
  try {
    const { plan_id, activity_date, title, description, category, hours, provider, evidence_url } = req.body;

    if (!plan_id || !activity_date || !title) {
      return res.status(400).json({ ok: false, error: 'plan_id, activity_date, and title are required' });
    }

    // Verify plan ownership or admin
    const plan = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('planId', sql.Int, plan_id).query(
        'SELECT id, initials, full_name FROM learning_dev_plans WHERE id = @planId'
      );
      return r.recordset[0];
    });

    if (!plan) return res.status(404).json({ ok: false, error: 'Plan not found' });
    if (plan.initials !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'You can only add activities to your own plan' });
    }

    submissionId = await recordSubmission({
      formKey: 'learning-dev-activity',
      submittedBy: req.userInitials,
      lane: 'Log',
      payload: req.body,
      summary: `L&D activity — ${title}`.slice(0, 400),
    });

    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('plan_id', sql.Int, plan_id)
        .input('initials', sql.NVarChar, plan.initials)
        .input('activity_date', sql.Date, activity_date)
        .input('title', sql.NVarChar, title)
        .input('description', sql.NVarChar, description || null)
        .input('category', sql.NVarChar, category || null)
        .input('hours', sql.Decimal(6, 2), hours || 0)
        .input('provider', sql.NVarChar, provider || null)
        .input('evidence_url', sql.NVarChar, evidence_url || null)
        .input('created_by', sql.NVarChar, req.userInitials)
        .query(`
          INSERT INTO learning_dev_activities
            (plan_id, initials, activity_date, title, description, category, hours, provider, evidence_url, created_by)
          OUTPUT INSERTED.*
          VALUES
            (@plan_id, @initials, @activity_date, @title, @description, @category, @hours, @provider, @evidence_url, @created_by)
        `);
      return result.recordset[0];
    });

    await recordStep(submissionId, {
      name: 'learning_dev_activities.insert',
      status: 'success',
      output: { id: record.id, plan_id },
    });
    await markComplete(submissionId, { lastEvent: 'L&D activity created' });

    await createRegisterTodoCard({
      kind: 'ld-review',
      ownerInitials: TODO_APPROVER_INITIALS,
      matterRef: buildLdTodoRef(record.id),
      docType: 'Learning & Development',
      stage: 'review',
      payload: {
        activityId: record.id,
        planId: plan_id,
        planInitials: plan.initials,
        fullName: plan.full_name || plan.initials,
        activityDate: record.activity_date,
        title: record.title,
        description: record.description,
        category: record.category,
        hours: Number(record.hours || 0),
        provider: record.provider,
        evidenceUrl: record.evidence_url,
        submittedBy: req.userInitials,
        createdAt: record.created_at,
      },
      summary: `Review L&D · ${plan.full_name || plan.initials} · ${record.title}`.slice(0, 400),
      lastEvent: 'Awaiting Alex review',
    });

    trackEvent('Registers.LearningDev.ActivityCreated', {
      activityId: String(record.id),
      planId: String(plan_id),
      createdBy: req.userInitials,
    });

    res.status(201).json({ ok: true, activity: record });
  } catch (err) {
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'learning_dev_activities.insert:failed', error: err });
    }
    trackException(err, { operation: 'Registers.LearningDev.CreateActivity', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev create activity error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to create activity' });
  }
});

router.put('/learning-dev/:id', requireInitials, async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    if (!Number.isFinite(planId)) return res.status(400).json({ ok: false, error: 'Invalid plan ID' });

    const existing = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('id', sql.Int, planId).query(
        'SELECT id, initials FROM learning_dev_plans WHERE id = @id'
      );
      return r.recordset[0];
    });

    if (!existing) return res.status(404).json({ ok: false, error: 'Plan not found' });
    if (existing.initials !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorised' });
    }

    const { target_hours, notes } = req.body;

    const updated = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, planId)
        .input('target_hours', sql.Decimal(6, 2), target_hours || 16)
        .input('notes', sql.NVarChar, notes || null)
        .query(`
          UPDATE learning_dev_plans
          SET target_hours = @target_hours, notes = @notes, updated_at = GETUTCDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return result.recordset[0];
    });

    trackEvent('Registers.LearningDev.PlanUpdated', {
      planId: String(planId),
      updatedBy: req.userInitials,
    });

    res.json({ ok: true, plan: updated });
  } catch (err) {
    trackException(err, { operation: 'Registers.LearningDev.UpdatePlan', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev update plan error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to update plan' });
  }
});

router.put('/learning-dev/activity/:id', requireInitials, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id, 10);
    if (!Number.isFinite(activityId)) return res.status(400).json({ ok: false, error: 'Invalid activity ID' });

    // Verify ownership
    const existing = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('id', sql.Int, activityId).query(
        `SELECT a.id, a.initials, a.activity_date, a.title, a.description, a.category,
                a.hours, a.provider, a.evidence_url, a.status
         FROM learning_dev_activities a
         WHERE a.id = @id`
      );
      return r.recordset[0];
    });

    if (!existing) return res.status(404).json({ ok: false, error: 'Activity not found' });
    if (existing.initials !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorised' });
    }

    const { activity_date, title, description, category, hours, provider, evidence_url, status } = req.body;

    const updated = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, activityId)
        .input('activity_date', sql.Date, activity_date ?? existing.activity_date)
        .input('title', sql.NVarChar, title ?? existing.title)
        .input('description', sql.NVarChar, description ?? existing.description ?? null)
        .input('category', sql.NVarChar, category ?? existing.category ?? null)
        .input('hours', sql.Decimal(6, 2), hours ?? existing.hours ?? 0)
        .input('provider', sql.NVarChar, provider ?? existing.provider ?? null)
        .input('evidence_url', sql.NVarChar, evidence_url ?? existing.evidence_url ?? null)
        .input('status', sql.NVarChar, status ?? existing.status ?? 'logged')
        .query(`
          UPDATE learning_dev_activities
          SET activity_date = @activity_date, title = @title, description = @description,
              category = @category, hours = @hours, provider = @provider,
              evidence_url = @evidence_url, status = @status, updated_at = GETUTCDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return result.recordset[0];
    });

    if (String(updated.status || '').toLowerCase() === 'verified') {
      await reconcileRegisterTodoCard({
        kind: 'ld-review',
        matterRef: buildLdTodoRef(activityId),
        completedVia: 'approve',
        lastEvent: 'Verified by Alex',
      });
    }

    res.json({ ok: true, activity: updated });
  } catch (err) {
    trackException(err, { operation: 'Registers.LearningDev.UpdateActivity', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev update activity error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to update activity' });
  }
});

router.delete('/learning-dev/activity/:id', requireInitials, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id, 10);
    if (!Number.isFinite(activityId)) return res.status(400).json({ ok: false, error: 'Invalid activity ID' });

    const existing = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('id', sql.Int, activityId).query(
        'SELECT a.id, a.initials FROM learning_dev_activities a WHERE a.id = @id'
      );
      return r.recordset[0];
    });

    if (!existing) return res.status(404).json({ ok: false, error: 'Activity not found' });
    if (existing.initials !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorised' });
    }

    await withRequest(getConnectionString(), async (request) => {
      await request.input('id', sql.Int, activityId).query('DELETE FROM learning_dev_activities WHERE id = @id');
    });

    trackEvent('Registers.LearningDev.ActivityDeleted', {
      activityId: String(activityId),
      deletedBy: req.userInitials,
    });

    res.json({ ok: true });
  } catch (err) {
    trackException(err, { operation: 'Registers.LearningDev.DeleteActivity', initiatedBy: req.userInitials });
    console.error('[registers] learning-dev delete activity error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to delete activity' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// UNDERTAKINGS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/undertakings', requireInitials, async (req, res) => {
  try {
    const statusFilter = req.query.status; // 'outstanding', 'discharged', 'breached', or omit for all
    const result = await withRequest(getConnectionString(), async (request) => {
      let query = 'SELECT * FROM undertakings WHERE 1=1';

      if (!req.isAdmin) {
        request.input('initials', sql.NVarChar, req.userInitials);
        query += ' AND given_by = @initials';
      }

      if (statusFilter) {
        request.input('status', sql.NVarChar, statusFilter);
        query += ' AND status = @status';
      }

      query += ' ORDER BY given_date DESC';
      const r = await request.query(query);
      return r.recordset;
    });

    trackEvent('Registers.Undertakings.Listed', {
      initiatedBy: req.userInitials,
      count: String(result.length),
    });

    res.json({ ok: true, undertakings: result });
  } catch (err) {
    trackException(err, { operation: 'Registers.Undertakings.List', initiatedBy: req.userInitials });
    console.error('[registers] undertakings list error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to load undertakings' });
  }
});

router.post('/undertakings', requireInitials, async (req, res) => {
  let submissionId = null;
  try {
    const { matter_ref, given_to, given_date, due_date, description, area_of_work } = req.body;

    if (!given_to || !given_date || !description) {
      return res.status(400).json({ ok: false, error: 'given_to, given_date, and description are required' });
    }

    submissionId = await recordSubmission({
      formKey: 'undertaking',
      submittedBy: req.userInitials,
      lane: 'Log',
      payload: req.body,
      summary: `Undertaking to ${given_to}: ${String(description).slice(0, 200)}`.slice(0, 400),
    });

    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('matter_ref', sql.NVarChar, matter_ref || null)
        .input('given_by', sql.NVarChar, req.userInitials)
        .input('given_to', sql.NVarChar, given_to)
        .input('given_date', sql.Date, given_date)
        .input('due_date', sql.Date, due_date || null)
        .input('description', sql.NVarChar, description)
        .input('area_of_work', sql.NVarChar, area_of_work || null)
        .input('created_by', sql.NVarChar, req.userInitials)
        .query(`
          INSERT INTO undertakings
            (matter_ref, given_by, given_to, given_date, due_date, description, area_of_work, created_by)
          OUTPUT INSERTED.*
          VALUES
            (@matter_ref, @given_by, @given_to, @given_date, @due_date, @description, @area_of_work, @created_by)
        `);
      return result.recordset[0];
    });

    await recordStep(submissionId, {
      name: 'undertakings.insert',
      status: 'success',
      output: { id: record.id },
    });
    await markComplete(submissionId, { lastEvent: 'undertaking recorded' });

    await createRegisterTodoCard({
      kind: 'undertaking-request',
      ownerInitials: TODO_APPROVER_INITIALS,
      matterRef: buildUndertakingTodoRef(record.id),
      docType: 'Undertaking',
      stage: 'pending',
      payload: {
        undertakingId: record.id,
        matterReference: record.matter_ref,
        givenBy: record.given_by,
        givenTo: record.given_to,
        givenDate: record.given_date,
        dueDate: record.due_date,
        description: record.description,
        areaOfWork: record.area_of_work,
        submittedBy: req.userInitials,
        createdAt: record.created_at,
      },
      summary: `Undertaking oversight · ${record.given_by} → ${record.given_to}`.slice(0, 400),
      lastEvent: 'Awaiting Alex oversight',
    });

    trackEvent('Registers.Undertakings.Created', {
      undertakingId: String(record.id),
      createdBy: req.userInitials,
    });

    res.status(201).json({ ok: true, undertaking: record });
  } catch (err) {
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'undertakings.insert:failed', error: err });
    }
    trackException(err, { operation: 'Registers.Undertakings.Create', initiatedBy: req.userInitials });
    console.error('[registers] undertakings create error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to create undertaking' });
  }
});

router.put('/undertakings/:id', requireInitials, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid ID' });

    const existing = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('id', sql.Int, id).query('SELECT id, given_by FROM undertakings WHERE id = @id');
      return r.recordset[0];
    });

    if (!existing) return res.status(404).json({ ok: false, error: 'Undertaking not found' });
    if (existing.given_by !== req.userInitials && !req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorised' });
    }

    const { matter_ref, given_to, given_date, due_date, description, status, discharged_date, discharged_notes, area_of_work } = req.body;

    const updated = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, id)
        .input('matter_ref', sql.NVarChar, matter_ref || null)
        .input('given_to', sql.NVarChar, given_to)
        .input('given_date', sql.Date, given_date)
        .input('due_date', sql.Date, due_date || null)
        .input('description', sql.NVarChar, description)
        .input('status', sql.NVarChar, status || 'outstanding')
        .input('discharged_date', sql.Date, discharged_date || null)
        .input('discharged_notes', sql.NVarChar, discharged_notes || null)
        .input('area_of_work', sql.NVarChar, area_of_work || null)
        .query(`
          UPDATE undertakings
          SET matter_ref = @matter_ref, given_to = @given_to, given_date = @given_date,
              due_date = @due_date, description = @description, status = @status,
              discharged_date = @discharged_date, discharged_notes = @discharged_notes,
              area_of_work = @area_of_work, updated_at = GETUTCDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return result.recordset[0];
    });

    trackEvent('Registers.Undertakings.Updated', {
      undertakingId: String(id),
      status: updated.status,
      updatedBy: req.userInitials,
    });

    if (String(updated.status || '').toLowerCase() === 'discharged') {
      await reconcileRegisterTodoCard({
        kind: 'undertaking-request',
        matterRef: buildUndertakingTodoRef(id),
        completedVia: 'approve',
        lastEvent: 'Undertaking discharged',
      });
    }

    res.json({ ok: true, undertaking: updated });
  } catch (err) {
    trackException(err, { operation: 'Registers.Undertakings.Update', initiatedBy: req.userInitials });
    console.error('[registers] undertakings update error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to update undertaking' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// COMPLAINTS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/complaints', requireInitials, async (req, res) => {
  try {
    const statusFilter = req.query.status;
    const result = await withRequest(getConnectionString(), async (request) => {
      let query = 'SELECT * FROM complaints WHERE 1=1';

      if (!req.isAdmin) {
        request.input('initials', sql.NVarChar, req.userInitials);
        query += ' AND respondent = @initials';
      }

      if (statusFilter) {
        request.input('status', sql.NVarChar, statusFilter);
        query += ' AND status = @status';
      }

      query += ' ORDER BY received_date DESC';
      const r = await request.query(query);
      return r.recordset;
    });

    trackEvent('Registers.Complaints.Listed', {
      initiatedBy: req.userInitials,
      count: String(result.length),
    });

    res.json({ ok: true, complaints: result });
  } catch (err) {
    trackException(err, { operation: 'Registers.Complaints.List', initiatedBy: req.userInitials });
    console.error('[registers] complaints list error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to load complaints' });
  }
});

router.post('/complaints', requireInitials, async (req, res) => {
  let submissionId = null;
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Only administrators can create complaints' });
    }

    const { matter_ref, complainant, respondent, received_date, description, category, area_of_work } = req.body;

    if (!complainant || !respondent || !received_date || !description) {
      return res.status(400).json({ ok: false, error: 'complainant, respondent, received_date, and description are required' });
    }

    submissionId = await recordSubmission({
      formKey: 'complaint',
      submittedBy: req.userInitials,
      lane: 'Log',
      payload: req.body,
      summary: `Complaint from ${complainant} re ${respondent}`.slice(0, 400),
    });

    const record = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('matter_ref', sql.NVarChar, matter_ref || null)
        .input('complainant', sql.NVarChar, complainant)
        .input('respondent', sql.NVarChar, respondent.toUpperCase())
        .input('received_date', sql.Date, received_date)
        .input('description', sql.NVarChar, description)
        .input('category', sql.NVarChar, category || null)
        .input('area_of_work', sql.NVarChar, area_of_work || null)
        .input('created_by', sql.NVarChar, req.userInitials)
        .query(`
          INSERT INTO complaints
            (matter_ref, complainant, respondent, received_date, description, category, area_of_work, created_by)
          OUTPUT INSERTED.*
          VALUES
            (@matter_ref, @complainant, @respondent, @received_date, @description, @category, @area_of_work, @created_by)
        `);
      return result.recordset[0];
    });

    await recordStep(submissionId, {
      name: 'complaints.insert',
      status: 'success',
      output: { id: record.id },
    });
    await markComplete(submissionId, { lastEvent: 'complaint recorded' });

    await createRegisterTodoCard({
      kind: 'complaint-followup',
      ownerInitials: TODO_APPROVER_INITIALS,
      matterRef: buildComplaintTodoRef(record.id),
      docType: 'Complaint',
      stage: 'review',
      payload: {
        complaintId: record.id,
        matterReference: record.matter_ref,
        complainant: record.complainant,
        respondent: record.respondent,
        receivedDate: record.received_date,
        category: record.category,
        areaOfWork: record.area_of_work,
        slaDeadline: buildComplaintSlaDeadline(record.received_date),
        submittedBy: req.userInitials,
        createdAt: record.created_at,
      },
      summary: `Complaint follow-up · ${record.complainant}`.slice(0, 400),
      lastEvent: 'Awaiting Alex review',
    });

    trackEvent('Registers.Complaints.Created', {
      complaintId: String(record.id),
      createdBy: req.userInitials,
    });

    res.status(201).json({ ok: true, complaint: record });
  } catch (err) {
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'complaints.insert:failed', error: err });
    }
    trackException(err, { operation: 'Registers.Complaints.Create', initiatedBy: req.userInitials });
    console.error('[registers] complaints create error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to create complaint' });
  }
});

router.put('/complaints/:id', requireInitials, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ ok: false, error: 'Only administrators can update complaints' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid ID' });

    const existing = await withRequest(getConnectionString(), async (request) => {
      const r = await request.input('id', sql.Int, id).query('SELECT id FROM complaints WHERE id = @id');
      return r.recordset[0];
    });

    if (!existing) return res.status(404).json({ ok: false, error: 'Complaint not found' });

    const { matter_ref, complainant, respondent, received_date, description, category, status, outcome, closed_date, lessons_learned, area_of_work } = req.body;

    const updated = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, id)
        .input('matter_ref', sql.NVarChar, matter_ref || null)
        .input('complainant', sql.NVarChar, complainant)
        .input('respondent', sql.NVarChar, (respondent || '').toUpperCase())
        .input('received_date', sql.Date, received_date)
        .input('description', sql.NVarChar, description)
        .input('category', sql.NVarChar, category || null)
        .input('status', sql.NVarChar, status || 'open')
        .input('outcome', sql.NVarChar, outcome || null)
        .input('closed_date', sql.Date, closed_date || null)
        .input('lessons_learned', sql.NVarChar, lessons_learned || null)
        .input('area_of_work', sql.NVarChar, area_of_work || null)
        .query(`
          UPDATE complaints
          SET matter_ref = @matter_ref, complainant = @complainant, respondent = @respondent,
              received_date = @received_date, description = @description, category = @category,
              status = @status, outcome = @outcome, closed_date = @closed_date,
              lessons_learned = @lessons_learned, area_of_work = @area_of_work,
              updated_at = GETUTCDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return result.recordset[0];
    });

    trackEvent('Registers.Complaints.Updated', {
      complaintId: String(id),
      status: updated.status,
      updatedBy: req.userInitials,
    });

    if (['resolved', 'closed'].includes(String(updated.status || '').toLowerCase())) {
      await reconcileRegisterTodoCard({
        kind: 'complaint-followup',
        matterRef: buildComplaintTodoRef(id),
        completedVia: 'approve',
        lastEvent: `Complaint ${String(updated.status || '').toLowerCase()}`,
      });
    }

    res.json({ ok: true, complaint: updated });
  } catch (err) {
    trackException(err, { operation: 'Registers.Complaints.Update', initiatedBy: req.userInitials });
    console.error('[registers] complaints update error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to update complaint' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK (used by formHealthCheck.js)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  try {
    await withRequest(getConnectionString(), async (request) => {
      await request.query(`
        SELECT 
          (SELECT COUNT(*) FROM undertakings) AS undertakings,
          (SELECT COUNT(*) FROM complaints) AS complaints,
          (SELECT COUNT(*) FROM learning_dev_plans) AS ld_plans
      `);
    });
    res.json({ ok: true, status: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, status: 'error', error: err.message });
  }
});

module.exports = router;
