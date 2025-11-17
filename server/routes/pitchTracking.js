const express = require('express');
const { withRequest } = require('../utils/db');

const router = express.Router();

// Get pitch/deal data for enquiries based on email addresses
router.get('/', async (req, res) => {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'Instructions SQL connection string not configured' });
  }

  try {
    const { enquiryEmails } = req.query;
    
    if (!enquiryEmails) {
      return res.status(400).json({ error: 'enquiryEmails parameter required' });
    }

    // Parse enquiry emails (comma-separated)
    const emails = enquiryEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    
    if (emails.length === 0) {
      return res.json([]);
    }

    // Create parameterized query to prevent SQL injection
    const placeholders = emails.map((_, index) => `@email${index}`).join(', ');
    
    const rows = await withRequest(connectionString, async (request) => {
      const sql = require('mssql');
      
      emails.forEach((email, index) => {
        request.input(`email${index}`, sql.NVarChar, email);
      });

      const result = await request.query(`
        SELECT 
          DealId,
          LeadClientEmail,
          ServiceDescription,
          Amount,
          Status,
          AreaOfWork,
          PitchedBy,
          PitchedDate,
          PitchedTime,
          CloseDate,
          CloseTime,
          PitchContent
        FROM [instructions].[dbo].[Deals]
        WHERE LOWER(LeadClientEmail) IN (${placeholders})
          AND Status IS NOT NULL
        ORDER BY PitchedDate DESC, PitchedTime DESC
      `);
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2);

    // Transform the data to include pitch scenario information
    const transformedData = rows.map(row => ({
      dealId: row.DealId,
      email: row.LeadClientEmail?.toLowerCase(),
      serviceDescription: row.ServiceDescription,
      amount: row.Amount,
      status: row.Status,
      areaOfWork: row.AreaOfWork,
      pitchedBy: row.PitchedBy,
      pitchedDate: row.PitchedDate,
      pitchedTime: row.PitchedTime,
      closeDate: row.CloseDate,
      closeTime: row.CloseTime,
      pitchContent: row.PitchContent,
      // Extract scenario from area of work or pitch content for display
      scenarioDisplay: getScenarioDisplayName(row.AreaOfWork, row.ServiceDescription)
    }));

    res.json(transformedData);
  } catch (error) {
    console.error('❌ Error fetching pitch tracking data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pitch tracking data',
      detail: error.message 
    });
  }
});

/**
 * Map area of work and service description to display names
 */
function getScenarioDisplayName(areaOfWork, serviceDescription) {
  // Map common area of work to scenario names
  const areaMapping = {
    'commercial': 'Commercial',
    'employment': 'Employment', 
    'property': 'Property',
    'construction': 'Construction',
    'family': 'Family',
    'crime': 'Crime'
  };
  
  // Check if area of work matches any known area
  const area = areaOfWork?.toLowerCase();
  if (area && areaMapping[area]) {
    return areaMapping[area];
  }
  
  // Fallback to area of work or service description
  return areaOfWork || 'Pitch';
}

module.exports = router;