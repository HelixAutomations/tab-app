const express = require('express');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * POST /api/matter-requests
 * Creates a matter request with optional opponent/solicitor records
 * Writes to instructions database (direct SQL, no Azure Function proxy)
 */
router.post('/', async (req, res) => {
    const body = req.body || {};

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });
    }

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

        res.status(201).json({ ok: true, matterId });
    } catch (err) {
        console.error('[matter-requests] Error:', err);
        res.status(500).json({ error: 'Failed to insert matter request', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

module.exports = router;
