const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');
const router = express.Router();

// Get team member email by initials
router.get('/', async (req, res) => {
  try {
    const { initials } = req.query;
    
    if (!initials || !initials.trim()) {
      return res.status(400).json({ error: 'Initials parameter is required' });
    }
    
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('SQL_CONNECTION_STRING not found in environment');
    }
    
    const result = await withRequest(connectionString, async (request) => {
      return request
        .input('initials', sql.NVarChar, initials.trim().toUpperCase())
        .query('SELECT Email, [Full Name], Initials FROM team WHERE Initials = @initials');
    });
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    const teamMember = result.recordset[0];
    res.json({
      email: teamMember.Email,
      fullName: teamMember['Full Name'],
      initials: teamMember.Initials
    });
    
  } catch (error) {
    console.error('Team lookup error:', error);
    res.status(500).json({ 
      error: 'Failed to lookup team member',
      details: error.message 
    });
  }
});

module.exports = router;