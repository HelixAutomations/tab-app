const { createEnvBasedQueryRunner } = require('./sqlHelpers');

const runTeamQuery = createEnvBasedQueryRunner('SQL_CONNECTION_STRING');

async function getClioId(initials) {
    const result = await runTeamQuery((request, s) =>
        request
            .input('initials', s.NVarChar, initials)
            .query('SELECT [Clio ID] FROM dbo.team WHERE Initials = @initials')
    );

    return result.recordset?.[0]?.['Clio ID'] || null;
}

/**
 * Resolve a team member's email from their initials.
 * Falls back to null if initials are not found.
 */
async function getTeamEmail(initials) {
    if (!initials) return null;
    const result = await runTeamQuery((request, s) =>
        request
            .input('initials', s.NVarChar, initials.toUpperCase())
            .query('SELECT [Email] FROM dbo.team WHERE UPPER(Initials) = @initials')
    );
    return result.recordset?.[0]?.['Email'] || null;
}

/**
 * Resolve a team member's initials from their email address.
 * Case-insensitive; returns null if not matched.
 */
async function getTeamInitialsByEmail(email) {
    if (!email) return null;
    try {
        const result = await runTeamQuery((request, s) =>
            request
                .input('email', s.NVarChar, String(email).trim().toLowerCase())
                .query('SELECT TOP 1 Initials FROM dbo.team WHERE LOWER([Email]) = @email')
        );
        return result.recordset?.[0]?.Initials || null;
    } catch {
        return null;
    }
}

module.exports = { getClioId, getTeamEmail, getTeamInitialsByEmail };