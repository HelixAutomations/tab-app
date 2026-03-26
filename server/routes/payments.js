
const express = require('express');
const sql = require('mssql');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException } = require('../utils/appInsights');
const {
    paymentOperationsTableExists,
    ensureBankTransferReviewOperation,
    cancelPendingPaymentOperations,
} = require('../utils/paymentOperations');

const router = express.Router();

// Database connection configuration
let dbConfig = null;

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  // Use the INSTRUCTIONS_SQL_CONNECTION_STRING from .env
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }
  
  // Parse connection string into config object
  const params = new URLSearchParams(connectionString.split(';').join('&'));
  const server = params.get('Server').replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const userId = params.get('User ID');
  const password = params.get('Password');
  
  dbConfig = {
    server: server,
    database: database,
    user: userId,
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true
    }
  };
  
  return dbConfig;
}

const parseJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

async function updateInstructionPaymentSummary(db, instructionRef, payment) {
    if (!instructionRef) return;

    const nowIso = new Date().toISOString();
    const paymentAmount = Number(payment?.amount || 0);
    const instructionColumns = await db.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Instructions'
    `);

    const cols = new Set((instructionColumns.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));
    const updates = [];

    if (cols.has('PaymentStatus')) updates.push(`PaymentStatus = 'Paid'`);
    if (cols.has('payment_status')) updates.push(`payment_status = 'Paid'`);
    if (cols.has('PaymentMethod')) updates.push(`PaymentMethod = 'Bank Transfer'`);
    if (cols.has('payment_method')) updates.push(`payment_method = 'Bank Transfer'`);
    if (cols.has('TotalPaid')) updates.push(`TotalPaid = ${paymentAmount}`);
    if (cols.has('total_paid')) updates.push(`total_paid = ${paymentAmount}`);
    if (cols.has('LastUpdated')) updates.push(`LastUpdated = '${nowIso}'`);
    if (cols.has('updated_at')) updates.push(`updated_at = '${nowIso}'`);

    if (updates.length === 0) return;

    await db.request()
        .input('instructionRef', sql.NVarChar, instructionRef)
        .query(`
            UPDATE Instructions
            SET ${updates.join(', ')}
            WHERE InstructionRef = @instructionRef
        `);
}

// DELETE /api/payments/delete - Delete or archive a payment record
router.delete('/delete', async (req, res) => {
    try {
        const { paymentId, archive } = req.body;
        
        if (!paymentId) {
            return res.status(400).json({ error: 'Payment ID is required' });
        }

        // Get database configuration
        const config = await getDbConfig();
        
        // Connect to database
        const pool = await sql.connect(config);
        
        if (archive) {
            // Archive: Update internal_status to 'archived'
            const result = await pool.request()
                .input('paymentId', sql.NVarChar, paymentId)
                .query(`
                    UPDATE Payments 
                    SET internal_status = 'archived',
                        updated_at = GETDATE()
                    WHERE id = @paymentId
                `);

            try {
                await cancelPendingPaymentOperations(pool, {
                    paymentId,
                    resolvedBy: 'system',
                    notes: 'Cancelled because the payment was archived.',
                });
            } catch {
                // Do not block archiving if the queue table has not been created yet.
            }

            await pool.close();

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ error: 'Payment not found' });
            }

            res.json({
                success: true,
                message: 'Payment archived successfully',
                paymentId
            });
        } else {
            // Delete: Permanently remove from database
            try {
                await cancelPendingPaymentOperations(pool, {
                    paymentId,
                    resolvedBy: 'system',
                    notes: 'Cancelled because the payment was deleted.',
                });
            } catch {
                // Do not block deletion if the queue table has not been created yet.
            }

            const result = await pool.request()
                .input('paymentId', sql.NVarChar, paymentId)
                .query(`
                    DELETE FROM Payments 
                    WHERE id = @paymentId
                `);

            await pool.close();

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ error: 'Payment not found' });
            }

            res.json({
                success: true,
                message: 'Payment deleted successfully',
                paymentId
            });
        }

    } catch (error) {
        console.error('Error removing payment:', error);
        res.status(500).json({ 
            error: 'Failed to remove payment',
            details: error.message 
        });
    }
});

// POST /api/payments/confirm-bank - Mark a bank transfer as confirmed and queue ops review
router.post('/confirm-bank', async (req, res) => {
    let pool;
    let transaction;

    try {
        const { paymentId, confirmedDate, confirmedBy } = req.body || {};

        if (!paymentId || !confirmedDate) {
            return res.status(400).json({ error: 'paymentId and confirmedDate are required' });
        }

        trackEvent('Payments.BankConfirm.Started', { paymentId, confirmedDate, confirmedBy: confirmedBy || 'unknown' });

        const config = await getDbConfig();
        pool = await sql.connect(config);

        const tableExists = await paymentOperationsTableExists(pool);
        if (!tableExists) {
            return res.status(409).json({
                error: 'Payment operations table is missing',
                details: 'Run scripts/migrate-payments-ops-approved.mjs before confirming bank payments.',
            });
        }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const paymentResult = await transaction.request()
            .input('paymentId', sql.NVarChar, paymentId)
            .query(`
                SELECT TOP 1 *
                FROM Payments
                WHERE id = @paymentId
            `);

        const payment = paymentResult.recordset[0];
        if (!payment) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (String(payment.internal_status || '').toLowerCase() === 'archived') {
            await transaction.rollback();
            return res.status(409).json({ error: 'Archived payments cannot be confirmed' });
        }

        const metadata = parseJsonObject(payment.metadata);
        const nextMetadata = {
            ...metadata,
            payment_method: metadata.payment_method || 'bank_transfer',
            method: metadata.method || 'Bank Transfer',
            bankConfirmedDate: confirmedDate,
            bankConfirmedBy: confirmedBy || null,
            opsReviewQueuedAt: new Date().toISOString(),
        };

        await transaction.request()
            .input('paymentId', sql.NVarChar, paymentId)
            .input('paymentStatus', sql.NVarChar, 'confirmed')
            .input('internalStatus', sql.NVarChar, 'paid')
            .input('metadata', sql.NVarChar(sql.MAX), JSON.stringify(nextMetadata))
            .query(`
                UPDATE Payments
                SET payment_status = @paymentStatus,
                    internal_status = @internalStatus,
                    metadata = @metadata,
                    updated_at = GETDATE()
                WHERE id = @paymentId
            `);

        await updateInstructionPaymentSummary(transaction, payment.instruction_ref, payment);

        const operationId = await ensureBankTransferReviewOperation(transaction, {
            paymentId,
            instructionRef: payment.instruction_ref,
            createdBy: confirmedBy || 'hub-user',
            confirmedDate,
            metadata: {
                source: 'bank_payment_confirmed',
                confirmedDate,
                confirmedBy: confirmedBy || null,
            },
        });

        await transaction.commit();

        trackEvent('Payments.BankConfirm.Completed', {
            paymentId,
            operationId,
            instructionRef: payment.instruction_ref || '',
            confirmedBy: confirmedBy || 'unknown',
        });

        res.json({ success: true, paymentId, operationId, instructionRef: payment.instruction_ref || null });
    } catch (error) {
        if (transaction) {
            try { await transaction.rollback(); } catch {}
        }
        trackException(error, { operation: 'Payments.BankConfirm', paymentId: req.body?.paymentId, confirmedDate: req.body?.confirmedDate });
        trackEvent('Payments.BankConfirm.Failed', {
            paymentId: req.body?.paymentId || '',
            error: error.message,
        });
        console.error('Error confirming bank payment:', error);
        res.status(500).json({ error: 'Failed to confirm bank payment', details: error.message });
    } finally {
        if (pool) {
            try { await pool.close(); } catch {}
        }
    }
});

// GET /api/payments/:instructionRef - Get payment details for an instruction
router.get('/:instructionRef', async (req, res) => {
    try {
        const { instructionRef } = req.params;
        
        if (!instructionRef) {
            return res.status(400).json({ error: 'Instruction reference is required' });
        }

        // Get database configuration
        const config = await getDbConfig();
        
        // Connect to database
        const pool = await sql.connect(config);
        
        // Query payments table for this instruction (exclude archived payments)
        const result = await pool.request()
            .input('instructionRef', sql.NVarChar, instructionRef)
            .query(`
                SELECT 
                    id,
                    payment_intent_id,
                    amount,
                    amount_minor,
                    currency,
                    payment_status,
                    internal_status,
                    client_secret,
                    metadata,
                    instruction_ref,
                    created_at,
                    updated_at,
                    webhook_events,
                    service_description,
                    area_of_work,
                    receipt_url
                FROM Payments 
                WHERE instruction_ref = @instructionRef 
                AND (internal_status IS NULL OR internal_status != 'archived')
                ORDER BY created_at DESC
            `);

        await pool.close();

        // Format the results
        const payments = result.recordset.map(payment => ({
            ...payment,
            // Format dates for display
            created_at: payment.created_at ? payment.created_at.toISOString() : null,
            updated_at: payment.updated_at ? payment.updated_at.toISOString() : null,
            // Format amount to 2 decimal places
            amount: payment.amount ? parseFloat(payment.amount).toFixed(2) : null
        }));

        res.json({
            success: true,
            instructionRef,
            payments,
            count: payments.length
        });

    } catch (error) {
        console.error('Error fetching payment details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch payment details',
            details: error.message 
        });
    }
});

module.exports = router;