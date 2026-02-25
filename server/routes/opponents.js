const express = require('express');
const sql = require('mssql');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

/**
 * GET /api/opponents/by-matter/:matterId
 * Returns opponent + solicitor records linked to a matter via OpponentID/OpponentSolicitorID.
 */
router.get('/by-matter/:matterId', async (req, res) => {
    const { matterId } = req.params;
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    let pool;
    try {
        pool = await sql.connect(connectionString);
        const result = await pool.request()
            .input('matterId', sql.NVarChar(255), matterId)
            .query(`
                SELECT
                    m.OpponentID,
                    m.OpponentSolicitorID,
                    opp.*,
                    sol.OpponentID AS SolOpponentID,
                    sol.PartyRole AS SolPartyRole,
                    sol.IsCompany AS SolIsCompany,
                    sol.Title AS SolTitle,
                    sol.FirstName AS SolFirstName,
                    sol.LastName AS SolLastName,
                    sol.CompanyName AS SolCompanyName,
                    sol.CompanyNumber AS SolCompanyNumber,
                    sol.Email AS SolEmail,
                    sol.Phone AS SolPhone,
                    sol.HouseNumber AS SolHouseNumber,
                    sol.Street AS SolStreet,
                    sol.City AS SolCity,
                    sol.County AS SolCounty,
                    sol.Postcode AS SolPostcode,
                    sol.Country AS SolCountry
                FROM Matters m
                LEFT JOIN Opponents opp ON m.OpponentID = opp.OpponentID
                LEFT JOIN Opponents sol ON m.OpponentSolicitorID = sol.OpponentID
                WHERE m.MatterID = @matterId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Matter not found or no opponents linked' });
        }

        const row = result.recordset[0];
        const opponent = row.OpponentID ? {
            OpponentID: row.OpponentID,
            PartyRole: row.PartyRole,
            IsCompany: row.IsCompany,
            Title: row.Title,
            FirstName: row.FirstName,
            LastName: row.LastName,
            CompanyName: row.CompanyName,
            CompanyNumber: row.CompanyNumber,
            Email: row.Email,
            Phone: row.Phone,
            HouseNumber: row.HouseNumber,
            Street: row.Street,
            City: row.City,
            County: row.County,
            Postcode: row.Postcode,
            Country: row.Country,
        } : null;

        const solicitor = row.SolOpponentID ? {
            OpponentID: row.SolOpponentID,
            PartyRole: row.SolPartyRole,
            IsCompany: row.SolIsCompany,
            Title: row.SolTitle,
            FirstName: row.SolFirstName,
            LastName: row.SolLastName,
            CompanyName: row.SolCompanyName,
            CompanyNumber: row.SolCompanyNumber,
            Email: row.SolEmail,
            Phone: row.SolPhone,
            HouseNumber: row.SolHouseNumber,
            Street: row.SolStreet,
            City: row.SolCity,
            County: row.SolCounty,
            Postcode: row.SolPostcode,
            Country: row.SolCountry,
        } : null;

        res.json({ ok: true, opponent, solicitor });
    } catch (err) {
        console.error('[opponents] by-matter error:', err);
        trackException(err, { component: 'Opponents', operation: 'GetByMatter', matterId });
        res.status(500).json({ error: 'Failed to fetch opponents', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

/**
 * POST /api/opponents
 * Creates opponent and/or solicitor records
 * Writes to instructions database (direct SQL, no Azure Function proxy)
 */
router.post('/', async (req, res) => {
    const startTime = Date.now();
    const body = req.body || {};
    const traceId = req.headers['x-matter-trace-id'] || '';
    trackEvent('MatterOpening.Opponents.Started', {
        hasOpponent: String(!!body.opponent),
        hasSolicitor: String(!!body.solicitor),
        traceId: String(traceId || ''),
    });

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        trackEvent('MatterOpening.Opponents.ConfigError', {
            reason: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured',
            traceId: String(traceId || ''),
        });
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    let pool;
    try {
        pool = await sql.connect(connectionString);

        let opponentId = null;
        if (body.opponent) {
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
                .input('HouseNumber', sql.NVarChar(50), op.address?.house_number || null)
                .input('Street', sql.NVarChar(255), op.address?.street || null)
                .input('City', sql.NVarChar(100), op.address?.city || null)
                .input('County', sql.NVarChar(100), op.address?.county || null)
                .input('Postcode', sql.NVarChar(20), op.address?.post_code || null)
                .input('Country', sql.NVarChar(100), op.address?.country || null)
                .query(`INSERT INTO Opponents (
                    PartyRole, IsCompany, Title, FirstName, LastName, CompanyName, CompanyNumber,
                    Email, Phone, HouseNumber, Street, City, County, Postcode, Country)
                    OUTPUT INSERTED.OpponentID
                    VALUES (
                    @PartyRole, @IsCompany, @Title, @FirstName, @LastName, @CompanyName, @CompanyNumber,
                    @Email, @Phone, @HouseNumber, @Street, @City, @County, @Postcode, @Country)`);
            opponentId = opRes.recordset[0].OpponentID;
        }

        let solicitorId = null;
        if (body.solicitor) {
            const sol = body.solicitor;
            const solRes = await pool.request()
                .input('PartyRole', sql.NVarChar(50), 'Opponent Solicitor')
                .input('IsCompany', sql.Bit, sol.is_company ? 1 : 0)
                .input('Title', sql.NVarChar(20), sol.title || null)
                .input('FirstName', sql.NVarChar(100), sol.first_name || null)
                .input('LastName', sql.NVarChar(100), sol.last_name || null)
                .input('CompanyName', sql.NVarChar(255), sol.company_name || null)
                .input('CompanyNumber', sql.NVarChar(50), sol.company_number || null)
                .input('Email', sql.NVarChar(255), sol.email || null)
                .input('Phone', sql.NVarChar(50), sol.phone || null)
                .input('HouseNumber', sql.NVarChar(50), sol.address?.house_number || null)
                .input('Street', sql.NVarChar(255), sol.address?.street || null)
                .input('City', sql.NVarChar(100), sol.address?.city || null)
                .input('County', sql.NVarChar(100), sol.address?.county || null)
                .input('Postcode', sql.NVarChar(20), sol.address?.post_code || null)
                .input('Country', sql.NVarChar(100), sol.address?.country || null)
                .query(`INSERT INTO Opponents (
                    PartyRole, IsCompany, Title, FirstName, LastName, CompanyName, CompanyNumber,
                    Email, Phone, HouseNumber, Street, City, County, Postcode, Country)
                    OUTPUT INSERTED.OpponentID
                    VALUES (
                    @PartyRole, @IsCompany, @Title, @FirstName, @LastName, @CompanyName, @CompanyNumber,
                    @Email, @Phone, @HouseNumber, @Street, @City, @County, @Postcode, @Country)`);
            solicitorId = solRes.recordset[0].OpponentID;
        }

        const durationMs = Date.now() - startTime;
        trackEvent('MatterOpening.Opponents.Completed', { opponentId: opponentId || '', solicitorId: solicitorId || '', hasOpponent: String(!!body.opponent), hasSolicitor: String(!!body.solicitor), durationMs: String(durationMs), traceId: String(traceId || '') });
        trackMetric('MatterOpening.Opponents.Duration', durationMs, {});
        res.json({ opponentId, solicitorId });
    } catch (err) {
        console.error('[opponents] Error:', err);
        trackException(err, { component: 'MatterOpening', operation: 'Opponents', phase: 'insert', traceId: String(traceId || '') });
        trackEvent('MatterOpening.Opponents.Failed', { error: err.message, durationMs: String(Date.now() - startTime), traceId: String(traceId || '') });
        res.status(500).json({ error: 'Failed to insert opponents', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

/**
 * GET /api/opponents/:opponentId
 * Returns a single opponent record by OpponentID.
 */
router.get('/:opponentId', async (req, res) => {
    const startTime = Date.now();
    const { opponentId } = req.params;

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    let pool;
    try {
        pool = await sql.connect(connectionString);
        const result = await pool.request()
            .input('opponentId', sql.UniqueIdentifier, opponentId)
            .query('SELECT * FROM Opponents WHERE OpponentID = @opponentId');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Opponent not found' });
        }

        const durationMs = Date.now() - startTime;
        trackEvent('Opponents.Get.Completed', { opponentId, durationMs: String(durationMs) });
        res.json({ ok: true, opponent: result.recordset[0] });
    } catch (err) {
        console.error('[opponents] Get error:', err);
        trackException(err, { component: 'Opponents', operation: 'Get', opponentId });
        res.status(500).json({ error: 'Failed to fetch opponent', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

/**
 * PUT /api/opponents/:opponentId
 * Updates an existing opponent record. Only provided fields are updated.
 */
router.put('/:opponentId', async (req, res) => {
    const startTime = Date.now();
    const { opponentId } = req.params;
    const body = req.body || {};

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

    trackEvent('Opponents.Update.Started', { opponentId, fields: String(Object.keys(body).join(',')) });

    // Map request body fields → SQL columns (same shape as POST)
    const fieldMap = {
        is_company:     { col: 'IsCompany',     type: sql.Bit,          val: body.is_company != null ? (body.is_company ? 1 : 0) : undefined },
        title:          { col: 'Title',          type: sql.NVarChar(20),  val: body.title },
        first_name:     { col: 'FirstName',      type: sql.NVarChar(100), val: body.first_name },
        last_name:      { col: 'LastName',       type: sql.NVarChar(100), val: body.last_name },
        company_name:   { col: 'CompanyName',    type: sql.NVarChar(255), val: body.company_name },
        company_number: { col: 'CompanyNumber',  type: sql.NVarChar(50),  val: body.company_number },
        email:          { col: 'Email',          type: sql.NVarChar(255), val: body.email },
        phone:          { col: 'Phone',          type: sql.NVarChar(50),  val: body.phone },
        house_number:   { col: 'HouseNumber',    type: sql.NVarChar(50),  val: body.house_number },
        street:         { col: 'Street',         type: sql.NVarChar(255), val: body.street },
        city:           { col: 'City',           type: sql.NVarChar(100), val: body.city },
        county:         { col: 'County',         type: sql.NVarChar(100), val: body.county },
        post_code:      { col: 'Postcode',       type: sql.NVarChar(20),  val: body.post_code },
        country:        { col: 'Country',        type: sql.NVarChar(100), val: body.country },
    };

    const updates = Object.entries(fieldMap).filter(([, v]) => v.val !== undefined);
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    let pool;
    try {
        pool = await sql.connect(connectionString);
        const request = pool.request();
        request.input('opponentId', sql.UniqueIdentifier, opponentId);

        const setClauses = updates.map(([key, { col, type, val }]) => {
            request.input(key, type, val);
            return `${col} = @${key}`;
        });

        const result = await request.query(
            `UPDATE Opponents SET ${setClauses.join(', ')} WHERE OpponentID = @opponentId`
        );

        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Opponent not found' });
        }

        const durationMs = Date.now() - startTime;
        trackEvent('Opponents.Update.Completed', { opponentId, updatedFields: String(updates.length), durationMs: String(durationMs) });
        trackMetric('Opponents.Update.Duration', durationMs, {});
        res.json({ ok: true, updated: result.rowsAffected[0] });
    } catch (err) {
        console.error('[opponents] Update error:', err);
        trackException(err, { component: 'Opponents', operation: 'Update', opponentId });
        trackEvent('Opponents.Update.Failed', { opponentId, error: err.message, durationMs: String(Date.now() - startTime) });
        res.status(500).json({ error: 'Failed to update opponent', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

module.exports = router;
