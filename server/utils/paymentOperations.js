const sql = require('mssql');

const PAYMENT_OPERATION_TYPES = {
  BANK_TRANSFER_REVIEW: 'bank_transfer_review',
};

const PAYMENT_OPERATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
};

const sanitizeIdPart = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

const buildBankTransferReviewOperationId = (paymentId) => `bank_transfer_review_${sanitizeIdPart(paymentId)}`;

async function paymentOperationsTableExists(db) {
  const result = await db.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'PaymentOperations'
  `);

  return result.recordset.length > 0;
}

async function ensureBankTransferReviewOperation(db, { paymentId, instructionRef, createdBy, confirmedDate, metadata } = {}) {
  const operationId = buildBankTransferReviewOperationId(paymentId);
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  await db.request()
    .input('operationId', sql.NVarChar(120), operationId)
    .input('paymentId', sql.NVarChar(120), String(paymentId || ''))
    .input('instructionRef', sql.NVarChar(50), instructionRef || null)
    .input('operationType', sql.NVarChar(50), PAYMENT_OPERATION_TYPES.BANK_TRANSFER_REVIEW)
    .input('status', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.PENDING)
    .input('createdBy', sql.NVarChar(100), createdBy || null)
    .input('notes', sql.NVarChar(sql.MAX), confirmedDate ? `Bank payment confirmed for ${confirmedDate}` : null)
    .input('metadata', sql.NVarChar(sql.MAX), metadataJson)
    .query(`
      IF NOT EXISTS (
        SELECT 1
        FROM PaymentOperations
        WHERE payment_id = @paymentId
          AND operation_type = @operationType
      )
      BEGIN
        INSERT INTO PaymentOperations (
          id,
          payment_id,
          instruction_ref,
          operation_type,
          status,
          created_at,
          created_by,
          notes,
          metadata
        )
        VALUES (
          @operationId,
          @paymentId,
          @instructionRef,
          @operationType,
          @status,
          GETDATE(),
          @createdBy,
          @notes,
          @metadata
        )
      END
    `);

  return operationId;
}

async function cancelPendingPaymentOperations(db, { paymentId, resolvedBy, notes } = {}) {
  const exists = await paymentOperationsTableExists(db);
  if (!exists) {
    return 0;
  }

  const result = await db.request()
    .input('paymentId', sql.NVarChar(120), String(paymentId || ''))
    .input('operationType', sql.NVarChar(50), PAYMENT_OPERATION_TYPES.BANK_TRANSFER_REVIEW)
    .input('status', sql.NVarChar(30), PAYMENT_OPERATION_STATUSES.CANCELLED)
    .input('resolvedBy', sql.NVarChar(100), resolvedBy || 'system')
    .input('notes', sql.NVarChar(sql.MAX), notes || 'Cancelled because the payment was archived or deleted.')
    .query(`
      UPDATE PaymentOperations
      SET status = @status,
          resolved_at = GETDATE(),
          resolved_by = @resolvedBy,
          notes = COALESCE(notes + CHAR(10), '') + @notes
      WHERE payment_id = @paymentId
        AND operation_type = @operationType
        AND status = 'pending'
    `);

  return result.rowsAffected?.[0] || 0;
}

module.exports = {
  PAYMENT_OPERATION_TYPES,
  PAYMENT_OPERATION_STATUSES,
  buildBankTransferReviewOperationId,
  paymentOperationsTableExists,
  ensureBankTransferReviewOperation,
  cancelPendingPaymentOperations,
};