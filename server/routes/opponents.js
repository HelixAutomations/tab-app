const express = require('express');
const sql = require('mssql');

const router = express.Router();

/**
 * POST /api/opponents
 * Creates opponent and/or solicitor records
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

        res.json({ opponentId, solicitorId });
    } catch (err) {
        console.error('[opponents] Error:', err);
        res.status(500).json({ error: 'Failed to insert opponents', detail: err.message });
    } finally {
        if (pool) await pool.close();
    }
});

module.exports = router;
