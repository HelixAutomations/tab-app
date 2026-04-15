const express = require('express');
const sql = require('mssql');
const { trackEvent, trackException } = require('../utils/appInsights');
const { withRequest, getPool } = require('../utils/db');
const { getCache, setCache, generateCacheKey, deleteCache } = require('../utils/redisClient');

// Cache TTLs for ops-queue read endpoints (seconds)
const OPS_CACHE_TTL = {
  PENDING: 60,
  RECENT: 90,
  CCL_DATES: 120,
  TRANSACTIONS: 90,
};

// Cache key helpers
const OPS_CACHE_KEYS = {
  pending: () => generateCacheKey('ops', 'pending'),
  recent: () => generateCacheKey('ops', 'recent'),
  cclDates: () => generateCacheKey('ops', 'ccl-dates-pending'),
  transactions: (range) => generateCacheKey('ops', 'transactions', range || 'mtd'),
};

// Invalidate all ops-queue read caches (called after writes)
async function invalidateOpsCache() {
  try {
    await deleteCache([
      OPS_CACHE_KEYS.pending(),
      OPS_CACHE_KEYS.recent(),
      OPS_CACHE_KEYS.cclDates(),
      OPS_CACHE_KEYS.transactions('mtd'),
    ]);
  } catch { /* best-effort */ }
}
const {
  ASANA_BASE_URL,
  ASANA_ACCOUNTS_PROJECT_ID,
  resolveAsanaAccessToken,
} = require('../utils/asana');
const {
  PAYMENT_OPERATION_TYPES,
  PAYMENT_OPERATION_STATUSES,
  paymentOperationsTableExists,
} = require('../utils/paymentOperations');
const {
  getClioAccessToken,
  updateSingleMatterDateField,
  updateLegacySqlCclDate,
  CCL_DATE_FIELD_ID,
} = require('./ccl-date');

const router = express.Router();

function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function deriveBankReference(instructionRef) {
  const ref = String(instructionRef || '').trim();
  if (!ref) return null;
  const passcode = ref.split('-').pop() || ref;
  return passcode === ref ? ref : `HLX-${passcode}`;
}

function derivePaymentMethodAndReference(row) {
  const metadata = parseJsonObject(row.metadata);
  let method = String(metadata.payment_method || metadata.method || '').toLowerCase();
  if (!method && metadata.source === 'bank_transfer') method = 'bank_transfer';
  if (!method && /^bank_/i.test(row.payment_intent_id || '')) method = 'bank_transfer';

  const isBank = method.includes('bank');
  const paymentMethod = isBank ? 'Bank' : 'Card';
  const paymentReference = isBank
    ? deriveBankReference(row.instruction_ref) || row.instruction_ref || row.payment_intent_id || row.id
    : row.instruction_ref || row.payment_intent_id || row.id;

  return { paymentMethod, paymentReference };
}

const getInstrConnStr = () => {
  const cs = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!cs) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  return cs;
};

// GET /api/ops-queue/pending - Fetch bank transfer operations awaiting ops approval
router.get('/pending', async (req, res) => {
  try {
    // Check Redis cache first
    const cacheKey = OPS_CACHE_KEYS.pending();
    const cached = await getCache(cacheKey);
    if (cached?.data) return res.json({ ...cached.data, cached: true });

    const pool = await getPool(getInstrConnStr());
    const tableExists = await paymentOperationsTableExists(pool);

    if (!tableExists) {
      return res.json({ success: true, items: [], count: 0, migrationRequired: true });
    }

    const result = await pool.request()
      .input('operationType', sql.NVarChar(50), PAYMENT_OPERATION_TYPES.BANK_TRANSFER_REVIEW)
      .input('pendingStatus', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.PENDING)
      .query(`
      SELECT
        po.id,
        po.payment_id,
        p.instruction_ref,
        p.amount,
        p.currency,
        p.payment_status,
        p.internal_status,
        p.metadata,
        p.service_description,
        p.area_of_work,
        po.created_at,
        p.updated_at,
        po.created_by,
        po.notes,
        i.FirstName,
        i.LastName,
        i.HelixContact
      FROM PaymentOperations po
      INNER JOIN Payments p ON p.id = po.payment_id
      LEFT JOIN Instructions i ON p.instruction_ref = i.InstructionRef
      WHERE po.operation_type = @operationType
        AND po.status = @pendingStatus
        AND (p.internal_status != 'archived' OR p.internal_status IS NULL)
      ORDER BY po.created_at DESC
    `);

    const items = result.recordset.map(row => ({
      ...row,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    }));

    const response = { success: true, items, count: items.length, migrationRequired: false };
    setCache(cacheKey, response, OPS_CACHE_TTL.PENDING).catch(() => {});
    res.json(response);
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.Pending', phase: 'query' });
    console.error('Error fetching ops queue:', error);
    res.status(500).json({ error: 'Failed to fetch ops queue', details: error.message });
  }
});

// GET /api/ops-queue/recent - Fetch recently approved payment operations (last 7 days)
router.get('/recent', async (req, res) => {
  try {
    // Check Redis cache first
    const cacheKey = OPS_CACHE_KEYS.recent();
    const cached = await getCache(cacheKey);
    if (cached?.data) return res.json({ ...cached.data, cached: true });

    const pool = await getPool(getInstrConnStr());
    const tableExists = await paymentOperationsTableExists(pool);

    if (!tableExists) {
      return res.json({ success: true, items: [], count: 0, migrationRequired: true });
    }

    const result = await pool.request()
      .input('operationType', sql.NVarChar(50), PAYMENT_OPERATION_TYPES.BANK_TRANSFER_REVIEW)
      .input('approvedStatus', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.APPROVED)
      .query(`
      SELECT
        po.id,
        po.payment_id,
        p.instruction_ref,
        p.amount,
        p.currency,
        p.service_description,
        p.area_of_work,
        po.resolved_by AS ops_approved_by,
        po.resolved_at AS ops_approved_at,
        i.FirstName,
        i.LastName
      FROM PaymentOperations po
      INNER JOIN Payments p ON p.id = po.payment_id
      LEFT JOIN Instructions i ON p.instruction_ref = i.InstructionRef
      WHERE po.operation_type = @operationType
        AND po.status = @approvedStatus
        AND po.resolved_at >= DATEADD(day, -7, GETDATE())
      ORDER BY po.resolved_at DESC
    `);

    const items = result.recordset.map(row => ({
      ...row,
      ops_approved_at: row.ops_approved_at ? row.ops_approved_at.toISOString() : null,
    }));

    const response = { success: true, items, count: items.length, migrationRequired: false };
    setCache(cacheKey, response, OPS_CACHE_TTL.RECENT).catch(() => {});
    res.json(response);
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.Recent', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch recent approvals', details: error.message });
  }
});

// POST /api/ops-queue/approve - Approve a bank transfer payment operation
router.post('/approve', async (req, res) => {
  try {
    const { operationId, approvedBy } = req.body;
    if (!operationId || !approvedBy) {
      return res.status(400).json({ error: 'operationId and approvedBy are required' });
    }

    trackEvent('OpsQueue.PaymentOperation.ApproveStarted', { operationId, approvedBy });

    const pool = await getPool(getInstrConnStr());
    const tableExists = await paymentOperationsTableExists(pool);

    if (!tableExists) {
      return res.status(409).json({
        error: 'Payment operations table is missing',
        details: 'Run scripts/migrate-payments-ops-approved.mjs before approving payments.',
      });
    }

    const result = await pool.request()
      .input('operationId', sql.NVarChar(120), operationId)
      .input('operationType', sql.NVarChar(50), PAYMENT_OPERATION_TYPES.BANK_TRANSFER_REVIEW)
      .input('pendingStatus', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.PENDING)
      .input('approvedStatus', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.APPROVED)
      .input('approvedBy', sql.NVarChar(100), approvedBy)
      .query(`
        UPDATE PaymentOperations
        SET status = @approvedStatus,
            resolved_by = @approvedBy,
            resolved_at = GETDATE()
        WHERE id = @operationId
          AND operation_type = @operationType
          AND status = @pendingStatus
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Operation not found or already approved' });
    }

    trackEvent('OpsQueue.PaymentOperation.ApproveCompleted', { operationId, approvedBy });
    invalidateOpsCache();
    res.json({ success: true, operationId, approvedBy });
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.PaymentOperation.Approve', phase: 'update' });
    trackEvent('OpsQueue.PaymentOperation.ApproveFailed', { operationId: req.body?.operationId, error: error.message });
    console.error('Error approving payment:', error);
    res.status(500).json({ error: 'Failed to approve payment', details: error.message });
  }
});

// ─── CCL Date Confirmation ─────────────────────────────────────────────────

// GET /api/ops-queue/ccl-dates-pending - Open matters missing a CCL date (last 90 days)
router.get('/ccl-dates-pending', async (req, res) => {
  try {
    // Check Redis cache first
    const cacheKey = OPS_CACHE_KEYS.cclDates();
    const cached = await getCache(cacheKey);
    if (cached?.data) return res.json({ ...cached.data, cached: true });

    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) return res.json({ success: true, items: [] });

    const result = await withRequest(connStr, async (request) => {
      return request.query(`
        SELECT TOP 30
          [Unique ID] AS matter_id,
          [Display Number] AS display_number,
          [Client Name] AS client_name,
          [Description] AS description,
          [Practice Area] AS practice_area,
          [Status] AS status,
          [Responsible Solicitor] AS fee_earner,
          [Open Date] AS open_date
        FROM matters
        WHERE [CCL_date] IS NULL
          AND [Status] = 'Open'
          AND [Open Date] >= DATEADD(day, -90, GETDATE())
        ORDER BY [Open Date] DESC
      `);
    });

    const items = (result.recordset || []).map(row => ({
      ...row,
      open_date: row.open_date ? new Date(row.open_date).toISOString() : null,
    }));

    const response = { success: true, items, count: items.length };
    setCache(cacheKey, response, OPS_CACHE_TTL.CCL_DATES).catch(() => {});
    res.json(response);
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.CclDatesPending', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch CCL pending items', details: error.message });
  }
});

// POST /api/ops-queue/ccl-date-confirm - Stamp CCL date on a single matter (Clio + SQL)
router.post('/ccl-date-confirm', async (req, res) => {
  try {
    const { matterId, displayNumber, dateValue, confirmedBy } = req.body || {};
    if (!matterId || !dateValue) {
      return res.status(400).json({ error: 'matterId and dateValue are required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return res.status(400).json({ error: 'dateValue must be YYYY-MM-DD' });
    }

    trackEvent('OpsQueue.CclDate.ConfirmStarted', { matterId, displayNumber: displayNumber || matterId, dateValue, confirmedBy: confirmedBy || '' });

    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    if (!legacyConn) {
      return res.status(500).json({ error: 'Missing database connection' });
    }

    // Clio update
    let clioOk = false;
    let clioSkipped = false;
    try {
      const accessToken = await getClioAccessToken();
      const clioResult = await updateSingleMatterDateField(matterId, displayNumber || matterId, dateValue, accessToken, CCL_DATE_FIELD_ID);
      clioOk = clioResult.success;
      clioSkipped = !!clioResult.skipped;
    } catch (clioErr) {
      trackException(clioErr, { operation: 'OpsQueue.CclDate.Clio', phase: 'patch', matterId });
      // Continue to SQL update even if Clio fails — SQL is the primary record
    }

    // SQL update
    await updateLegacySqlCclDate(legacyConn, matterId, displayNumber || matterId, dateValue);

    trackEvent('OpsQueue.CclDate.ConfirmCompleted', { matterId, displayNumber: displayNumber || matterId, clioOk: String(clioOk), clioSkipped: String(clioSkipped), confirmedBy: confirmedBy || '' });
    invalidateOpsCache();
    res.json({ success: true, matterId, clioOk, clioSkipped });
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.CclDate.Confirm', phase: 'update' });
    trackEvent('OpsQueue.CclDate.ConfirmFailed', { matterId: req.body?.matterId, error: error.message });
    res.status(500).json({ error: 'Failed to confirm CCL date', details: error.message });
  }
});

// ─── Transaction Approval ──────────────────────────────────────────────────

// GET /api/ops-queue/transactions-pending - Transactions for ops review
// ?range=week|lastWeek|mtd (default: mtd)
router.get('/transactions-pending', async (req, res) => {
  try {
    // Check Redis cache first
    const range = req.query.range || 'mtd';
    const cacheKey = OPS_CACHE_KEYS.transactions(range);
    const cached = await getCache(cacheKey);
    if (cached?.data) return res.json({ ...cached.data, cached: true });

    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) return res.json({ success: true, items: [] });

    // Calculate date boundaries
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Always fetch MTD (superset) — client filters further
    const sinceDate = monthStart.toISOString().split('T')[0];

    const result = await withRequest(connStr, async (request) => {
      request.input('sinceDate', sql.Date, sinceDate);
      return request.query(`
        SELECT
          transaction_id,
          matter_ref,
          matter_description,
          fe,
          amount,
          transaction_date,
          from_client,
          money_sender,
          type,
          status
        FROM transactions
        WHERE transaction_date >= @sinceDate
        ORDER BY transaction_date DESC
      `);
    });

    const items = (result.recordset || []).map(row => ({
      ...row,
      transaction_date: row.transaction_date ? new Date(row.transaction_date).toISOString() : null,
    }));

    const response = { success: true, items, count: items.length };
    setCache(cacheKey, response, OPS_CACHE_TTL.TRANSACTIONS).catch(() => {});
    res.json(response);
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.TransactionsPending', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch pending transactions', details: error.message });
  }
});

// POST /api/ops-queue/transaction-approve - Approve a pending transaction transfer
router.post('/transaction-approve', async (req, res) => {
  try {
    const { transactionId, action, userInitials, customAmount } = req.body || {};
    if (!transactionId || !action || !userInitials) {
      return res.status(400).json({ error: 'transactionId, action, and userInitials are required' });
    }

    const validActions = ['leave', 'transfer', 'transfer_custom'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    trackEvent('OpsQueue.Transaction.ApproveStarted', { transactionId, action, userInitials });

    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) return res.status(500).json({ error: 'Missing database connection' });

    const newStatus = action === 'leave' ? 'leave_in_client' : 'transfer';

    await withRequest(connStr, async (request) => {
      request.input('transactionId', sql.NVarChar, transactionId);
      request.input('newStatus', sql.NVarChar, newStatus);
      request.input('approvedBy', sql.NVarChar, userInitials);
      if (action === 'transfer_custom' && customAmount != null) {
        request.input('customAmount', sql.Decimal(18, 2), customAmount);
        return request.query(`
          UPDATE transactions
          SET status = @newStatus,
              amount = @customAmount
          WHERE transaction_id = @transactionId AND status = 'requested'
        `);
      }
      return request.query(`
        UPDATE transactions
        SET status = @newStatus
        WHERE transaction_id = @transactionId AND status = 'requested'
      `);
    });

    trackEvent('OpsQueue.Transaction.ApproveCompleted', { transactionId, action, newStatus, userInitials });
    invalidateOpsCache();
    res.json({ success: true, transactionId, newStatus });
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.Transaction.Approve', phase: 'update' });
    trackEvent('OpsQueue.Transaction.ApproveFailed', { transactionId: req.body?.transactionId, error: error.message });
    res.status(500).json({ error: 'Failed to approve transaction', details: error.message });
  }
});

// ─── Payment ID Lookup ─────────────────────────────────────────────────────

// GET /api/ops-queue/payment-lookup?q=xxx - Look up a payment by ID or payment_intent_id
router.get('/payment-lookup', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'q (payment ID) is required' });
    }

    const result = await withRequest(getInstrConnStr(), async (request) => {
      return request
        .input('q', sql.NVarChar, q)
        .query(`
        SELECT TOP 1
          p.id,
          p.payment_intent_id,
          p.amount,
          p.currency,
          p.payment_status,
          p.internal_status,
          p.instruction_ref,
          p.service_description,
          p.area_of_work,
          p.created_at,
          p.updated_at,
          i.FirstName,
          i.LastName,
          i.HelixContact,
          i.Email,
          i.Stage,
          d.Passcode,
          d.DealId
        FROM Payments p
        LEFT JOIN Instructions i ON p.instruction_ref = i.InstructionRef
        LEFT JOIN Deals d ON i.DealId = d.DealId
        WHERE p.id = @q
           OR p.payment_intent_id = @q
      `);
    });

    if (result.recordset.length === 0) {
      return res.json({ success: true, found: false });
    }

    const row = result.recordset[0];
    res.json({
      success: true,
      found: true,
      payment: {
        id: row.id,
        paymentIntentId: row.payment_intent_id,
        amount: row.amount != null ? parseFloat(row.amount).toFixed(2) : null,
        currency: row.currency,
        paymentStatus: row.payment_status,
        internalStatus: row.internal_status,
        instructionRef: row.instruction_ref,
        serviceDescription: row.service_description,
        areaOfWork: row.area_of_work,
        createdAt: row.created_at ? row.created_at.toISOString() : null,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
        firstName: row.FirstName,
        lastName: row.LastName,
        helixContact: row.HelixContact,
        email: row.Email,
        stage: row.Stage,
        passcode: row.Passcode,
        dealId: row.DealId,
      },
    });
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.PaymentLookup', phase: 'query' });
    res.status(500).json({ error: 'Failed to look up payment', details: error.message });
  }
});

// ─── Stripe Recent Payments ──────────────────────────────────────────────────

// GET /api/ops-queue/stripe-recent - Recent payments from the Payments table (last 14 days)
router.get('/stripe-recent', async (req, res) => {
  try {
    const result = await withRequest(getInstrConnStr(), async (request) => {
      return request.query(`
        SELECT TOP 30
          p.id,
          p.payment_intent_id,
          p.amount,
          p.currency,
          p.payment_status,
          p.internal_status,
          p.instruction_ref,
          p.service_description,
          p.area_of_work,
          p.created_at,
          p.updated_at,
          p.metadata,
          i.FirstName,
          i.LastName,
          i.HelixContact
        FROM Payments p
        LEFT JOIN Instructions i ON p.instruction_ref = i.InstructionRef
        WHERE p.created_at >= DATEADD(day, -14, GETDATE())
          AND (p.internal_status != 'archived' OR p.internal_status IS NULL)
        ORDER BY p.created_at DESC
      `);
    });

    const items = result.recordset.map(row => {
      const { paymentMethod, paymentReference } = derivePaymentMethodAndReference(row);
      return {
      id: row.id,
      paymentIntentId: row.payment_intent_id,
      amount: row.amount != null ? parseFloat(row.amount) : null,
      currency: row.currency || 'GBP',
      paymentStatus: row.payment_status,
      internalStatus: row.internal_status,
      instructionRef: row.instruction_ref,
      serviceDescription: row.service_description,
      areaOfWork: row.area_of_work,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
      firstName: row.FirstName,
      lastName: row.LastName,
      helixContact: row.HelixContact,
      paymentMethod,
      paymentReference,
    };
    });

    res.json({ success: true, items, count: items.length });
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.StripeRecent', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch recent payments', details: error.message });
  }
});

// ─── Asana Accounts Reconciliation ─────────────────────────────────────────

// Short-lived in-memory cache for Asana tasks (external API, ~1.5-3s)
const asanaCache = { data: null, expires: 0 };
const ASANA_CACHE_TTL = 30_000; // 30s

// GET /api/ops-queue/asana-account-tasks - Fetch incomplete tasks from the accounts Asana project
router.get('/asana-account-tasks', async (req, res) => {
  try {
    // Serve from cache if fresh
    if (asanaCache.data && Date.now() < asanaCache.expires) {
      return res.json(asanaCache.data);
    }

    const initials = String(req.query.initials || 'KW').trim();
    const accessToken = await resolveAsanaAccessToken({ initials });
    if (!accessToken) {
      return res.status(500).json({ success: false, error: 'Unable to acquire Asana access token.' });
    }

    // Fetch sections
    const sectionsRes = await fetch(
      `${ASANA_BASE_URL}/projects/${ASANA_ACCOUNTS_PROJECT_ID}/sections?opt_fields=name,gid`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
    );
    if (!sectionsRes.ok) {
      const text = await sectionsRes.text();
      return res.status(sectionsRes.status).json({ success: false, error: text || 'Asana sections fetch failed.' });
    }
    const sections = (await sectionsRes.json()).data || [];

    // Fetch incomplete tasks per section in parallel
    const sectionResults = await Promise.all(
      sections.map(async (section) => {
        try {
          const tasksRes = await fetch(
            `${ASANA_BASE_URL}/sections/${section.gid}/tasks?completed_since=now&opt_fields=gid,name,completed,assignee.name,permalink_url,due_on,created_at&limit=100`,
            { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
          );
          if (!tasksRes.ok) return { section: section.name, sectionGid: section.gid, tasks: [] };
          const tasksData = (await tasksRes.json()).data || [];
          return {
            section: section.name,
            sectionGid: section.gid,
            tasks: tasksData.map(t => {
              // Parse matter_ref from task name (e.g. "HLX-12345-67890 - Transfer Request")
              const refMatch = t.name.match(/^([A-Z]+-\d+-\d+)/i);
              return {
                gid: t.gid,
                name: t.name,
                matterRef: refMatch ? refMatch[1].toUpperCase() : null,
                assignee: t.assignee?.name || null,
                dueOn: t.due_on || null,
                createdAt: t.created_at || null,
                url: t.permalink_url || null,
              };
            }),
          };
        } catch {
          return { section: section.name, sectionGid: section.gid, tasks: [] };
        }
      })
    );

    // Build flat task list with section info
    const tasks = [];
    for (const sr of sectionResults) {
      for (const t of sr.tasks) {
        tasks.push({ ...t, section: sr.section, sectionGid: sr.sectionGid });
      }
    }

    trackEvent('OpsQueue.AsanaAccountTasks.Fetched', { taskCount: String(tasks.length), sectionCount: String(sectionResults.length) });
    const result = { success: true, tasks, sections: sectionResults.map(s => ({ name: s.section, gid: s.sectionGid, count: s.tasks.length })) };
    asanaCache.data = result;
    asanaCache.expires = Date.now() + ASANA_CACHE_TTL;
    res.json(result);
  } catch (error) {
    trackException(error, { operation: 'OpsQueue.AsanaAccountTasks', phase: 'fetch' });
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch Asana account tasks.' });
  }
});

module.exports = router;
