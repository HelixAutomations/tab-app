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

// ─── Rich team-member lookup (cached 5 minutes) ─────────────────────────
// Used by the Hub-native task intake processor. Single SELECT pulls every
// column the fan-out legs need: Asana per-user project gids, Clio user id,
// email for Teams DM + mail. Cached in-process to avoid hammering core-data
// on every intake event.

const RICH_TTL_MS = 5 * 60 * 1000;
let _rosterCache = null;
let _rosterFetchedAt = 0;
let _rosterInflight = null;

async function loadRoster() {
    const now = Date.now();
    if (_rosterCache && (now - _rosterFetchedAt) < RICH_TTL_MS) return _rosterCache;
    if (_rosterInflight) return _rosterInflight;
    _rosterInflight = (async () => {
        const result = await runTeamQuery((request) =>
            request.query(`
                SELECT
                    [First], [Last], [Initials], [Email], [Clio ID],
                    [ASANA_ID], [ASANATeam_ID], [ASANAPending_ID], [ASANAUser_ID],
                    [AOW], [Role], [status]
                FROM dbo.team
            `)
        );
        _rosterCache = result.recordset || [];
        _rosterFetchedAt = Date.now();
        _rosterInflight = null;
        return _rosterCache;
    })();
    return _rosterInflight;
}

function normaliseMember(row) {
    if (!row) return null;
    return {
        first: row['First'] || null,
        last: row['Last'] || null,
        initials: row['Initials'] || null,
        email: row['Email'] || null,
        clioId: row['Clio ID'] != null ? String(row['Clio ID']) : null,
        asanaUserGid: row['ASANA_ID'] ? String(row['ASANA_ID']) : null,
        asanaTeamGid: row['ASANATeam_ID'] ? String(row['ASANATeam_ID']) : null,
        asanaPendingProjectGid: row['ASANAPending_ID'] ? String(row['ASANAPending_ID']) : null,
        asanaPersonalProjectGid: row['ASANAUser_ID'] ? String(row['ASANAUser_ID']) : null,
        aow: row['AOW'] || null,
        role: row['Role'] || null,
        status: row['status'] || null,
    };
}

function _norm(value) {
    return String(value || '').trim().toLowerCase();
}

/**
 * Resolve a team member by first name, initials, or email. Case-insensitive.
 * Returns the normalised profile or null if no match.
 */
async function findTeamMember({ firstName, initials, email } = {}) {
    const roster = await loadRoster();
    if (!Array.isArray(roster) || roster.length === 0) return null;
    const wantFirst = _norm(firstName);
    const wantInitials = String(initials || '').trim().toUpperCase();
    const wantEmail = _norm(email);
    let row = null;
    if (wantInitials) row = roster.find((r) => String(r['Initials'] || '').toUpperCase() === wantInitials) || null;
    if (!row && wantEmail) row = roster.find((r) => _norm(r['Email']) === wantEmail) || null;
    if (!row && wantFirst) row = roster.find((r) => _norm(r['First']) === wantFirst) || null;
    return normaliseMember(row);
}

/**
 * Resolve every member matching an AOW or team label. Used for team-wide
 * task fan-out (followers). Case-insensitive substring match on AOW field.
 */
async function findTeamByLabel(label) {
    if (!label) return [];
    const roster = await loadRoster();
    const want = _norm(label);
    return roster
        .filter((r) => _norm(r['AOW']).split(',').some((part) => part.trim() === want))
        .map(normaliseMember);
}

function _resetRosterCacheForTests() {
    _rosterCache = null;
    _rosterFetchedAt = 0;
    _rosterInflight = null;
}

module.exports = {
    getClioId,
    getTeamEmail,
    getTeamInitialsByEmail,
    findTeamMember,
    findTeamByLabel,
    _resetRosterCacheForTests,
};