const express = require('express');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

/**
 * POST /api/matter-requests
 * Creates a matter request with optional opponent/solicitor records
 * Writes to instructions database (direct SQL, no Azure Function proxy)
 */
router.post('/', async (req, res) => {
    const mrStartTime = Date.now();
    const body = req.body || {};
    const instructionRef = body.instructionRef || 'unknown';

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        trackEvent('MatterOpening.MatterRequest.ConfigError', { instructionRef, reason: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    trackEvent('MatterOpening.MatterRequest.Started', { instructionRef, clientType: body.clientType || '', responsibleSolicitor: body.responsibleSolicitor || '' });
    let pool;
    try {
        pool = await sql.connect(connectionString);

        // Insert opponent if provided
        let opponentId = body.opponentId || null;
        if (!opponentId && body.opponent) {
            const op = body.opponent;
            const opRes = await pool.request()
                .input('PartyRole', sql.NVarChar(50), 'Opponent')
                .input('IsCompany', sql.Bit, op.is_company ? 1 : 0)
                .input('Title', sql.NVarChar(20), op.title || null)
                .input('FirstName', sql.NVarChar(100), op.first_name || null)
                .input('LastName', sql.NVarChar(100), op.last_name || null)
                .input('CompanyName', sql.NVarChar(255), op.company_name || null)
                .input('CompanyNumber', sql.NVarChar(50), op.company_number || null)
                .input('Email', sql.NVarChar(255), op.email || null)
                .input('Phone', sql.NVarChar(50), op.phone || null)
                .input('HouseNumber', sql.NVarChar(50), null)
                .input('Street', sql.NVarChar(255), op.address || null)
                .input('City', sql.NVarChar(100), null)
                .input('County', sql.NVarChar(100), null)
                .input('Postcode', sql.NVarChar(20), null)
                .input('Country', sql.NVarChar(100), null)
                .query(`INSERT INTO Opponents (
                    PartyRole, IsCompany, Title, FirstName, LastName, CompanyName, CompanyNumber,
                    Email, Phone, HouseNumber, Street, City, County, Postcode, Country)
                    OUTPUT INSERTED.OpponentID
                    VALUES (
                    @PartyRole, @IsCompany, @Title, @FirstName, @LastName, @CompanyName, @CompanyNumber,
                    @Email, @Phone, @HouseNumber, @Street, @City, @County, @Postcode, @Country)`);
            opponentId = opRes.recordset[0].OpponentID;
        }

        // Insert solicitor if provided
        let solicitorId = body.solicitorId || null;
        if (!solicitorId && body.solicitor) {
            const sol = body.solicitor;
            const solRes = await pool.request()
                .input('PartyRole', sql.NVarChar(50), 'Solicitor')
                .input('IsCompany', sql.Bit, sol.is_company ? 1 : 0)
                .input('Title', sql.NVarChar(20), sol.title || null)
                .input('FirstName', sql.NVarChar(100), sol.first_name || null)
                .input('LastName', sql.NVarChar(100), sol.last_name || null)
                .input('CompanyName', sql.NVarChar(255), sol.company_name || null)
                .input('CompanyNumber', sql.NVarChar(50), sol.company_number || null)
                .input('Email', sql.NVarChar(255), sol.email || null)
                .input('Phone', sql.NVarChar(50), sol.phone || null)
                .input('HouseNumber', sql.NVarChar(50), null)
                .input('Street', sql.NVarChar(255), sol.address || null)
                .input('City', sql.NVarChar(100), null)
                .input('County', sql.NVarChar(100), null)
                .input('Postcode', sql.NVarChar(20), null)
                .input('Country', sql.NVarChar(100), null)
                .query(`INSERT INTO Opponents (
                    PartyRole, IsCompany, Title, FirstName, LastName, CompanyName, CompanyNumber,
                    Email, Phone, HouseNumber, Street, City, County, Postcode, Country)
                    OUTPUT INSERTED.OpponentID
                    VALUES (
                    @PartyRole, @IsCompany, @Title, @FirstName, @LastName, @CompanyName, @CompanyNumber,
                    @Email, @Phone, @HouseNumber, @Street, @City, @County, @Postcode, @Country)`);
            solicitorId = solRes.recordset[0].OpponentID;
        }

        // Insert matter request
        const matterId = uuidv4();
        const now = new Date();
        const openTime = new Date(0);
        openTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

        await pool.request()
            .input('MatterID', sql.NVarChar(255), matterId)
            .input('InstructionRef', sql.NVarChar(255), body.instructionRef || null)
            .input('ClientType', sql.NVarChar(255), body.clientType || null)
            .input('Description', sql.NVarChar(sql.MAX), body.description || null)
            .input('PracticeArea', sql.NVarChar(255), body.practiceArea || null)
            .input('ApproxValue', sql.NVarChar(50), body.value || null)
            .input('ResponsibleSolicitor', sql.NVarChar(255), body.responsibleSolicitor || null)
            .input('OriginatingSolicitor', sql.NVarChar(255), body.originatingSolicitor || null)
            .input('SupervisingPartner', sql.NVarChar(255), body.supervisingPartner || null)
            .input('Source', sql.NVarChar(255), body.source || null)
            .input('Referrer', sql.NVarChar(255), body.referrer || null)
            .input('OpponentID', sql.UniqueIdentifier, opponentId)
            .input('OpponentSolicitorID', sql.UniqueIdentifier, solicitorId)
            .input('Status', sql.NVarChar(50), 'MatterRequest')
            .input('OpenDate', sql.Date, new Date())
            .input('OpenTime', sql.Time, openTime)
            .query(`
                INSERT INTO Matters (
                    MatterID, InstructionRef, ClientType, Description, PracticeArea, ApproxValue,
                    ResponsibleSolicitor, OriginatingSolicitor, SupervisingPartner, Source, Referrer,
                    OpponentID, OpponentSolicitorID, Status, OpenDate, OpenTime)
                VALUES (
                    @MatterID, @InstructionRef, @ClientType, @Description, @PracticeArea, @ApproxValue,
                    @ResponsibleSolicitor, @OriginatingSolicitor, @SupervisingPartner, @Source, @Referrer,
                    @OpponentID, @OpponentSolicitorID, @Status, @OpenDate, @OpenTime)
            `);

        const mrDurationMs = Date.now() - mrStartTime;
        trackEvent('MatterOpening.MatterRequest.Completed', { instructionRef, matterId, durationMs: String(mrDurationMs) });
        trackMetric('MatterOpening.MatterRequest.Duration', mrDurationMs, { instructionRef });
        res.status(201).json({ ok: true, matterId });
    } catch (err) {
        const mrDurationMs = Date.now() - mrStartTime;
        console.error('[matter-requests] Error:', err);
        trackException(err, { component: 'MatterOpening', operation: 'MatterRequest', phase: 'insert', instructionRef });
        trackEvent('MatterOpening.MatterRequest.Failed', { instructionRef, error: err.message, durationMs: String(mrDurationMs) });
        res.status(500).json({ error: 'Failed to insert matter request', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

/**
 * PATCH /api/matter-requests/:matterId
 * Updates a MatterRequest placeholder once real IDs are available
 */
router.patch('/:matterId', async (req, res) => {
    const patchStartTime = Date.now();
    const { matterId } = req.params;
    const body = req.body || {};
    const traceId = req.headers['x-matter-trace-id'] || '';

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        trackEvent('MatterOpening.MatterRequestPatch.ConfigError', {
            matterId: String(matterId || ''),
            reason: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured',
            traceId: String(traceId || ''),
        });
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    if (!matterId) {
        trackEvent('MatterOpening.MatterRequestPatch.ValidationFailed', {
            reason: 'matterId is required',
            traceId: String(traceId || ''),
        });
        return res.status(400).json({ error: 'matterId is required' });
    }

    const updates = {
        instructionRef: body.instructionRef ?? null,
        clientId: body.clientId ?? null,
        displayNumber: body.displayNumber ?? null,
        clioMatterId: body.clioMatterId ?? null
    };
    const cclQueuedAt = new Date().toISOString();

    if (!updates.instructionRef && !updates.clientId && !updates.displayNumber && !updates.clioMatterId) {
        trackEvent('MatterOpening.MatterRequestPatch.ValidationFailed', {
            matterId: String(matterId || ''),
            reason: 'No update fields provided',
            traceId: String(traceId || ''),
        });
        return res.status(400).json({ error: 'No update fields provided' });
    }

    trackEvent('MatterOpening.MatterRequestPatch.Started', {
        matterId: String(matterId || ''),
        instructionRef: String(updates.instructionRef || ''),
        hasClientId: String(!!updates.clientId),
        hasDisplayNumber: String(!!updates.displayNumber),
        hasClioMatterId: String(!!updates.clioMatterId),
        traceId: String(traceId || ''),
    });

    let pool;
    try {
        pool = await sql.connect(connectionString);

        const result = await pool.request()
            .input('matterId', sql.NVarChar(255), matterId)
            .input('instructionRef', sql.NVarChar(255), updates.instructionRef)
            .input('clientId', sql.NVarChar(255), updates.clientId)
            .input('displayNumber', sql.NVarChar(255), updates.displayNumber)
            .input('clioMatterId', sql.NVarChar(255), updates.clioMatterId)
            .query(`
                UPDATE Matters
                SET
                    InstructionRef = COALESCE(@instructionRef, InstructionRef),
                    ClientID = COALESCE(@clientId, ClientID),
                    DisplayNumber = COALESCE(@displayNumber, DisplayNumber),
                    MatterID = COALESCE(@clioMatterId, MatterID)
                WHERE MatterID = @matterId
            `);

        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            trackEvent('MatterOpening.MatterRequestPatch.NotFound', {
                matterId: String(matterId || ''),
                traceId: String(traceId || ''),
            });
            return res.status(404).json({ error: 'Matter request not found' });
        }

        const durationMs = Date.now() - patchStartTime;
        trackEvent('MatterOpening.MatterRequestPatch.Completed', {
            matterId: String(matterId || ''),
            updated: String(result.rowsAffected[0] || 0),
            durationMs: String(durationMs),
            cclQueuedAt,
            traceId: String(traceId || ''),
        });
        trackMetric('MatterOpening.MatterRequestPatch.Duration', durationMs, {});
        return res.json({ ok: true, updated: result.rowsAffected[0], cclQueuedAt });
    } catch (err) {
        console.error('[matter-requests] Patch error:', err);
        trackException(err, {
            component: 'MatterOpening',
            operation: 'MatterRequestPatch',
            matterId: String(matterId || ''),
            traceId: String(traceId || ''),
        });
        trackEvent('MatterOpening.MatterRequestPatch.Failed', {
            matterId: String(matterId || ''),
            error: String(err.message || err),
            durationMs: String(Date.now() - patchStartTime),
            traceId: String(traceId || ''),
        });
        return res.status(500).json({ error: 'Failed to update matter request', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

module.exports = router;
