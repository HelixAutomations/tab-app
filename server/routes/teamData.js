const express = require('express');
const { withRequest } = require('../utils/db');

const router = express.Router();
const { annotate } = require('../utils/devConsole');

// Get team data (shared pool + retry via withRequest)
// Anonymous callers only receive the minimal active-user payload needed by EntryGate.
router.get('/', async (req, res) => {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'SQL_CONNECTION_STRING not configured' });
  }

  try {
    const rows = await withRequest(connectionString, async (request) => {
      const result = await request.query(`
        SELECT 
          [Created Date],
          [Created Time], 
          [Full Name],
          [Last],
          [First],
          [Nickname],
          [Initials],
          [Email],
          [Entra ID],
          [Clio ID],
          [Rate],
          [Role],
          [AOW],
          [holiday_entitlement],
          [status]
        FROM [dbo].[team]
        ORDER BY [Full Name]
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2);

    const active = rows.filter((m) => String(m.status || '').toLowerCase() === 'active').length;
    const inactive = rows.filter((m) => String(m.status || '').toLowerCase() === 'inactive').length;
    const isAnonymousBootstrap = !req.user;
    const payload = isAnonymousBootstrap
      ? rows
          .filter((m) => String(m.status || '').toLowerCase() === 'active')
          .map((m) => ({
            'Full Name': m['Full Name'] || '',
            First: m.First || '',
            Last: m.Last || '',
            Nickname: m.Nickname || '',
            Initials: m.Initials || '',
            Email: m.Email || '',
            Role: m.Role || '',
            AOW: m.AOW || '',
            status: m.status || 'active',
          }))
      : rows;

    console.info('[teamData] Summary', { active, inactive });
    annotate(res, {
      source: 'sql',
      note: isAnonymousBootstrap
        ? `${active} active bootstrap users`
        : `${active} active, ${inactive} inactive`,
    });
    return res.json(payload);
  } catch (error) {
    console.error('\u274c Team data fetch error:', error);
    // For flows that can tolerate missing team data, degrade gracefully with empty array
    return res.status(200).json([]);
  }
});

module.exports = router;
