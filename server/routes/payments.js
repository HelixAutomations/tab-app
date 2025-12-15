
const express = require('express');
const sql = require('mssql');
const { getSecret } = require('../utils/getSecret');

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