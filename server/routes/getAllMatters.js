const express = require('express');
const router = express.Router();

/**
 * Route: GET /api/getAllMatters
 * 
 * Proxy route that forwards requests to the Azure Function at port 7071.
 * This retrieves ALL matters from the database (no user filtering).
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Express route: Proxying getAllMatters to Azure Function...');
    
    const azureFunctionUrl = 'http://localhost:7072/api/getAllMatters';
    
    const response = await fetch(azureFunctionUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Azure Function responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Express route: Successfully proxied getAllMatters, count:', Array.isArray(data) ? data.length : 'unknown');
    
    res.json(data);
  } catch (error) {
    console.error('❌ Express route: Error proxying getAllMatters:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve all matters',
      details: error.message 
    });
  }
});

module.exports = router;
