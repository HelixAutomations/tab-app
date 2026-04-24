const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');
const { sql, getPool, withRequest } = require('../utils/db');
const { getCache, setCache, generateCacheKey, deleteCache } = require('../utils/redisClient');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');

const router = express.Router();

// Cache config
const V2_CACHE_TTL = 60; // 1 minute
const v2CacheKey = (range) => generateCacheKey('transactions-v2', range || 'mtd');

async function invalidateV2Cache() {
  try {
    await deleteCache([v2CacheKey('mtd'), v2CacheKey('week'), v2CacheKey('today')]);
  } catch { /* non-critical */ }
}

const serialiseTransactionV2Row = (row) => ({
  ...row,
  transaction_date: row?.transaction_date ? new Date(row.transaction_date).toISOString() : null,
  created_at: row?.created_at ? new Date(row.created_at).toISOString() : null,
  updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  approved_at: row?.approved_at ? new Date(row.approved_at).toISOString() : null,
});

/**
 * GET /api/transactions-v2
 * Fetch V2 transactions with date filtering
 * ?range=today|week|mtd (default: mtd)
 * ?fe=XX (optional, filter by fee earner initials)
 */
router.get('/', async (req, res) => {
  try {
    const range = req.query.range || 'mtd';
    const feFilter = req.query.fe ? String(req.query.fe).trim().toUpperCase() : null;

    const cacheKey = v2CacheKey(`${range}${feFilter ? `-${feFilter}` : ''}`);
    const cached = await getCache(cacheKey);
    if (cached?.data) return res.json({ ...cached.data, cached: true });

    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.json({ success: true, items: [], count: 0 });

    // Calculate date boundary
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let sinceDate;
    if (range === 'today') sinceDate = todayStart;
    else if (range === 'week') sinceDate = thisMonday;
    else sinceDate = monthStart;

    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    const result = await withRequest(connStr, async (request) => {
      request.input('sinceDate', sql.Date, sinceDateStr);

      let query = `
        SELECT *
        FROM transactions_v2
        WHERE transaction_date >= @sinceDate
      `;

      if (feFilter) {
        request.input('fe', sql.NVarChar, feFilter);
        query += ` AND fee_earner = @fe`;
      }

      query += ` ORDER BY transaction_date DESC, created_at DESC`;
      return request.query(query);
    });

    const items = (result.recordset || []).map(serialiseTransactionV2Row);

    const response = { success: true, items, count: items.length };
    setCache(cacheKey, response, V2_CACHE_TTL).catch(() => {});
    res.json(response);
  } catch (error) {
    trackException(error, { operation: 'TransactionsV2.List', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch V2 transactions' });
  }
});

/**
 * POST /api/transactions-v2
 * Create a new V2 transaction (hub-native intake)
 */
router.post('/', async (req, res) => {
  let submissionId = null;
  try {
    const {
      matterRef, matterDescription, feeEarner, amount,
      transactionDate, transactionTime, fromClient, moneySender,
      transactionType, notes, createdBy,
      matterId, instructionRef, vatAmount, cardId, acid,
      collaborators, debitAccount, payeeName, paymentReference,
      sortCode, accountNumber, bankVerified, invoiceNumber,
      clientId, clientFirstName, clientLastName, clientEmail, companyName,
    } = req.body || {};

    // Redact bank details before storage — keep last 2/4 digits only
    const redactSortCode = (sc) => sc ? sc.replace(/./g, (c, i) => i >= sc.length - 2 ? c : '*') : null;
    const redactAccountNumber = (an) => an ? an.replace(/./g, (c, i) => i >= an.length - 4 ? c : '*') : null;
    const redactedSortCode = redactSortCode(sortCode);
    const redactedAccountNumber = redactAccountNumber(accountNumber);

    if (!matterRef || amount == null || !transactionDate || !createdBy) {
      return res.status(400).json({
        error: 'matterRef, amount, transactionDate, and createdBy are required',
      });
    }

    // Audit log: record submission (best-effort, never throws).
    // Note: we redact bank details before payload capture as well.
    try {
      submissionId = await recordSubmission({
        formKey: 'transactions-v2',
        submittedBy: String(createdBy || 'UNK').slice(0, 10),
        lane: 'Request',
        payload: { ...req.body, sortCode: redactedSortCode, accountNumber: redactedAccountNumber },
        summary: `Transaction: ${matterRef} — £${amount} (${transactionType || 'receipt'})`.slice(0, 400),
      });
    } catch (logErr) {
      trackException(logErr, { phase: 'transactionsV2.recordSubmission' });
    }

    trackEvent('TransactionsV2.CreateStarted', {
      matterRef, amount: String(amount), transactionType, createdBy,
    });

    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.status(500).json({ error: 'Missing database connection' });

    const result = await withRequest(connStr, async (request) => {
      request.input('sourceType', sql.NVarChar, 'hub_intake');
      request.input('matterRef', sql.NVarChar, matterRef);
      request.input('matterDescription', sql.NVarChar, matterDescription || null);
      request.input('feeEarner', sql.NVarChar, feeEarner || null);
      request.input('amount', sql.Decimal(18, 2), amount);
      request.input('transactionDate', sql.Date, transactionDate);
      request.input('transactionTime', sql.Time, transactionTime || null);
      request.input('fromClient', sql.Bit, fromClient ? 1 : 0);
      request.input('moneySender', sql.NVarChar, moneySender || null);
      request.input('transactionType', sql.NVarChar, transactionType || 'receipt');
      request.input('notes', sql.NVarChar, notes || null);
      request.input('createdBy', sql.NVarChar, createdBy);
      request.input('matterId', sql.Int, matterId || null);
      request.input('instructionRef', sql.NVarChar, instructionRef || null);
      request.input('vatAmount', sql.Decimal(18, 2), vatAmount || null);
      request.input('cardId', sql.NVarChar, cardId || null);
      request.input('acid', sql.NVarChar, acid || null);
      request.input('collaborators', sql.NVarChar, collaborators || null);
      request.input('debitAccount', sql.NVarChar, debitAccount || null);
      request.input('payeeName', sql.NVarChar, payeeName || null);
      request.input('paymentReference', sql.NVarChar, paymentReference || null);
      request.input('sortCode', sql.NVarChar, redactedSortCode);
      request.input('accountNumber', sql.NVarChar, redactedAccountNumber);
      request.input('bankVerified', sql.Bit, bankVerified != null ? (bankVerified ? 1 : 0) : null);
      request.input('invoiceNumber', sql.NVarChar, invoiceNumber || null);
      request.input('clientId', sql.Int, clientId || null);
      request.input('clientFirstName', sql.NVarChar, clientFirstName || null);
      request.input('clientLastName', sql.NVarChar, clientLastName || null);
      request.input('clientEmail', sql.NVarChar, clientEmail || null);
      request.input('companyName', sql.NVarChar, companyName || null);

      return request.query(`
        INSERT INTO transactions_v2 (
          source_type, matter_ref, matter_description, fee_earner,
          amount, transaction_date, transaction_time, from_client, money_sender,
          transaction_type, lifecycle_status, created_by, notes,
          matter_id, instruction_ref, vat_amount, card_id, acid,
          collaborators, debit_account, payee_name, payment_reference,
          sort_code, account_number, bank_verified, invoice_number,
          client_id, client_first_name, client_last_name, client_email, company_name
        )
        OUTPUT INSERTED.id, INSERTED.created_at
        VALUES (
          @sourceType, @matterRef, @matterDescription, @feeEarner,
          @amount, @transactionDate, @transactionTime, @fromClient, @moneySender,
          @transactionType, 'pending', @createdBy, @notes,
          @matterId, @instructionRef, @vatAmount, @cardId, @acid,
          @collaborators, @debitAccount, @payeeName, @paymentReference,
          @sortCode, @accountNumber, @bankVerified, @invoiceNumber,
          @clientId, @clientFirstName, @clientLastName, @clientEmail, @companyName
        )
      `)
    });

    const inserted = result.recordset?.[0];
    trackEvent('TransactionsV2.CreateCompleted', {
      id: String(inserted?.id), matterRef, createdBy,
    });

    await recordStep(submissionId, {
      name: 'transactions_v2.insert',
      status: 'success',
      output: { id: inserted?.id },
    });
    await markComplete(submissionId, { lastEvent: 'transaction created (pending)' });

    invalidateV2Cache();
    res.json({ success: true, id: inserted?.id, createdAt: inserted?.created_at });
  } catch (error) {
    trackException(error, { operation: 'TransactionsV2.Create', phase: 'insert' });
    trackEvent('TransactionsV2.CreateFailed', { error: error.message });
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'transactions-v2:insert:failed', error });
    }
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

/**
 * POST /api/transactions-v2/:id/convert-to-request
 * Convert an aged debt suggestion into a live pending transfer request.
 * Body: { userInitials }
 */
router.post('/:id/convert-to-request', async (req, res) => {
  let transaction;

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid transaction ID' });

    const { userInitials } = req.body || {};
    if (!userInitials) {
      return res.status(400).json({ error: 'userInitials is required' });
    }

    trackEvent('TransactionsV2.DebtConvertStarted', { id: String(id), userInitials });

    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.status(500).json({ error: 'Missing database connection' });

    const pool = await getPool(connStr);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const debtResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 *
        FROM transactions_v2
        WHERE id = @id AND source_type = 'aged_debt'
      `);

    const debt = debtResult.recordset?.[0];
    if (!debt) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Aged debt record not found' });
    }

    const debtStatus = String(debt.lifecycle_status || 'pending').toLowerCase();
    if (!['pending', 'rejected'].includes(debtStatus)) {
      await transaction.rollback();
      return res.status(409).json({ error: 'This aged debt has already been actioned' });
    }

    const now = new Date();
    const requestNotes = [
      debt.notes,
      `Converted from aged debt #${id} by ${userInitials}`,
    ].filter(Boolean).join(' | ');
    const debtActionNotes = [
      debt.action_notes,
      `Queued as transfer request by ${userInitials}`,
    ].filter(Boolean).join(' | ');

    const insertResult = await new sql.Request(transaction)
      .input('sourceType', sql.NVarChar, 'aged_debt_request')
      .input('matterRef', sql.NVarChar, debt.matter_ref)
      .input('matterDescription', sql.NVarChar, debt.matter_description || null)
      .input('feeEarner', sql.NVarChar, debt.fee_earner || null)
      .input('amount', sql.Decimal(18, 2), debt.amount)
      .input('transactionDate', sql.Date, now)
      .input('transactionTime', sql.Time, null)
      .input('fromClient', sql.Bit, debt.from_client ? 1 : 0)
      .input('moneySender', sql.NVarChar, debt.money_sender || null)
      .input('transactionType', sql.NVarChar, debt.transaction_type || 'receipt')
      .input('createdBy', sql.NVarChar, userInitials)
      .input('notes', sql.NVarChar, requestNotes || null)
      .input('actionNotes', sql.NVarChar, `Created from aged debt #${id}`)
      .input('matterId', sql.Int, debt.matter_id || null)
      .input('instructionRef', sql.NVarChar, debt.instruction_ref || null)
      .input('vatAmount', sql.Decimal(18, 2), debt.vat_amount || null)
      .input('cardId', sql.NVarChar, debt.card_id || null)
      .input('acid', sql.NVarChar, debt.acid || null)
      .input('collaborators', sql.NVarChar, debt.collaborators || null)
      .input('debitAccount', sql.NVarChar, debt.debit_account || null)
      .input('payeeName', sql.NVarChar, debt.payee_name || null)
      .input('paymentReference', sql.NVarChar, debt.payment_reference || null)
      .input('sortCode', sql.NVarChar, debt.sort_code || null)
      .input('accountNumber', sql.NVarChar, debt.account_number || null)
      .input('bankVerified', sql.Bit, debt.bank_verified != null ? (debt.bank_verified ? 1 : 0) : null)
      .input('invoiceNumber', sql.NVarChar, debt.invoice_number || null)
      .input('clientId', sql.Int, debt.client_id || null)
      .input('clientFirstName', sql.NVarChar, debt.client_first_name || null)
      .input('clientLastName', sql.NVarChar, debt.client_last_name || null)
      .input('clientEmail', sql.NVarChar, debt.client_email || null)
      .input('companyName', sql.NVarChar, debt.company_name || null)
      .query(`
        INSERT INTO transactions_v2 (
          source_type, matter_ref, matter_description, fee_earner,
          amount, transaction_date, transaction_time, from_client, money_sender,
          transaction_type, lifecycle_status, created_by, notes, action_notes,
          matter_id, instruction_ref, vat_amount, card_id, acid,
          collaborators, debit_account, payee_name, payment_reference,
          sort_code, account_number, bank_verified, invoice_number,
          client_id, client_first_name, client_last_name, client_email, company_name
        )
        OUTPUT INSERTED.*
        VALUES (
          @sourceType, @matterRef, @matterDescription, @feeEarner,
          @amount, @transactionDate, @transactionTime, @fromClient, @moneySender,
          @transactionType, 'pending', @createdBy, @notes, @actionNotes,
          @matterId, @instructionRef, @vatAmount, @cardId, @acid,
          @collaborators, @debitAccount, @payeeName, @paymentReference,
          @sortCode, @accountNumber, @bankVerified, @invoiceNumber,
          @clientId, @clientFirstName, @clientLastName, @clientEmail, @companyName
        )
      `);

    const updateDebtResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('newStatus', sql.NVarChar, 'converted_to_request')
      .input('approvedBy', sql.NVarChar, userInitials)
      .input('actionNotes', sql.NVarChar, debtActionNotes)
      .query(`
        UPDATE transactions_v2
        SET lifecycle_status = @newStatus,
            approved_by = @approvedBy,
            approved_at = GETUTCDATE(),
            updated_at = GETUTCDATE(),
            action_notes = @actionNotes
        OUTPUT INSERTED.*
        WHERE id = @id AND source_type = 'aged_debt'
      `);

    await transaction.commit();

    const transfer = serialiseTransactionV2Row(insertResult.recordset?.[0]);
    const updatedDebt = serialiseTransactionV2Row(updateDebtResult.recordset?.[0]);

    trackEvent('TransactionsV2.DebtConvertCompleted', {
      id: String(id),
      userInitials,
      transferId: String(transfer?.id || ''),
      matterRef: debt.matter_ref || '',
    });

    invalidateV2Cache();
    res.json({ success: true, transfer, debt: updatedDebt });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
    }

    trackException(error, { operation: 'TransactionsV2.DebtConvert', id: req.params.id, phase: 'convert' });
    trackEvent('TransactionsV2.DebtConvertFailed', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to convert aged debt to transfer request' });
  }
});

/**
 * POST /api/transactions-v2/:id/action
 * Approve, reject, or leave a transaction in client account
 * Body: { action: 'approve' | 'leave_in_client' | 'reject', userInitials, customAmount? }
 */
router.post('/:id/action', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid transaction ID' });

    const { action, userInitials, customAmount, actionNotes } = req.body || {};
    if (!action || !userInitials) {
      return res.status(400).json({ error: 'action and userInitials are required' });
    }

    const validActions = ['approve', 'leave_in_client', 'reject'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    trackEvent('TransactionsV2.ActionStarted', { id: String(id), action, userInitials });

    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.status(500).json({ error: 'Missing database connection' });

    const statusMap = {
      approve: 'approved',
      leave_in_client: 'left_in_client',
      reject: 'rejected',
    };
    const newStatus = statusMap[action];

    await withRequest(connStr, async (request) => {
      request.input('id', sql.Int, id);
      request.input('newStatus', sql.NVarChar, newStatus);
      request.input('approvedBy', sql.NVarChar, userInitials);
      request.input('actionNotes', sql.NVarChar, actionNotes || null);

      if (action === 'approve' && customAmount != null) {
        request.input('customAmount', sql.Decimal(18, 2), customAmount);
        return request.query(`
          UPDATE transactions_v2
          SET lifecycle_status = @newStatus,
              amount = @customAmount,
              approved_by = @approvedBy,
              approved_at = GETUTCDATE(),
              updated_at = GETUTCDATE(),
              action_notes = @actionNotes
          WHERE id = @id AND lifecycle_status = 'pending'
        `);
      }

      return request.query(`
        UPDATE transactions_v2
        SET lifecycle_status = @newStatus,
            approved_by = @approvedBy,
            approved_at = GETUTCDATE(),
            updated_at = GETUTCDATE(),
            action_notes = @actionNotes
        WHERE id = @id AND lifecycle_status = 'pending'
      `);
    });

    trackEvent('TransactionsV2.ActionCompleted', { id: String(id), action, newStatus, userInitials });
    invalidateV2Cache();
    res.json({ success: true, id, newStatus });
  } catch (error) {
    trackException(error, { operation: 'TransactionsV2.Action', phase: 'update' });
    trackEvent('TransactionsV2.ActionFailed', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to action transaction' });
  }
});

/**
 * PATCH /api/transactions-v2/:id/link-task
 * Manually link/unlink an Asana task to a V2 transaction
 * Body: { externalTaskId: string | null, externalTaskUrl: string | null }
 */
router.patch('/:id/link-task', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid transaction ID' });

    const { externalTaskId, externalTaskUrl } = req.body || {};

    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.status(500).json({ error: 'Missing database connection' });

    trackEvent('TransactionsV2.LinkTask.Started', { id: String(id), externalTaskId: externalTaskId || 'unlink' });

    await withRequest(connStr, async (request) => {
      request.input('id', sql.Int, id);
      request.input('externalTaskId', sql.NVarChar, externalTaskId || null);
      request.input('externalTaskUrl', sql.NVarChar, externalTaskUrl || null);
      return request.query(`
        UPDATE transactions_v2
        SET external_task_id = @externalTaskId,
            external_task_url = @externalTaskUrl,
            updated_at = GETUTCDATE()
        WHERE id = @id
      `);
    });

    trackEvent('TransactionsV2.LinkTask.Completed', { id: String(id), externalTaskId: externalTaskId || 'unlinked' });
    invalidateV2Cache();
    res.json({ success: true, id, externalTaskId: externalTaskId || null });
  } catch (error) {
    trackException(error, { operation: 'TransactionsV2.LinkTask', phase: 'update' });
    res.status(500).json({ error: 'Failed to link task' });
  }
});

/**
 * GET /api/transactions-v2/debts
 * Fetch aged debt items for the current user (or all for admin)
 * ?fe=XX (optional, filter by fee earner)
 */
router.get('/debts', async (req, res) => {
  try {
    const feFilter = req.query.fe ? String(req.query.fe).trim().toUpperCase() : null;
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) return res.json({ success: true, items: [], count: 0 });

    const result = await withRequest(connStr, async (request) => {
      let query = `
        SELECT *
        FROM transactions_v2
        WHERE source_type = 'aged_debt'
      `;

      if (feFilter) {
        request.input('fe', sql.NVarChar, feFilter);
        query += ` AND fee_earner = @fe`;
      }

      query += ` ORDER BY transaction_date DESC`;
      return request.query(query);
    });

    const items = (result.recordset || []).map(serialiseTransactionV2Row);

    res.json({ success: true, items, count: items.length });
  } catch (error) {
    trackException(error, { operation: 'TransactionsV2.Debts', phase: 'query' });
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

module.exports = router;
