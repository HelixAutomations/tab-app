const express = require('express');
const { getSecret } = require('../utils/getSecret');
const router = express.Router();

// Route: GET /api/enquiries
// Calls the external fetchEnquiriesData function (decoupled function in private vnet)
router.get('/', async (req, res) => {
  try {
  // Enquiries route called

    // Try to get the function code
    let functionCode;
    try {
      functionCode = await getSecret('fetchEnquiriesData-code');
  // Function code retrieved
    } catch (kvError) {
      console.error('❌ Failed to get function code:', kvError.message);
      return res.status(500).json({
        enquiries: [],
        count: 0,
        error: 'Failed to authenticate with external function'
      });
    }

    // Build the URL to the external function - remove date filters to avoid column issues
    const baseUrl = 'https://instructions-vnet-functions.azurewebsites.net/api/fetchEnquiriesData';
    const queryParams = new URLSearchParams();
    queryParams.append('code', functionCode);
    // Don't pass date parameters to avoid Touchpoint_Date column error
    const url = `${baseUrl}?${queryParams.toString()}`;

  // Calling external function URL (all data)

    // Call the external function
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Enquiries] Function call failed: ${response.status} ${response.statusText}`, errorText);
      // Return empty data instead of failing - don't block app
      return res.status(200).json({ enquiries: [], count: 0, error: 'Data temporarily unavailable' });
    }

    const data = await response.json();
  // Enquiries data fetched
    res.json(data);
  } catch (err) {
    console.warn('[Enquiries] Error calling fetchEnquiriesData:', err.message);
    console.error('Full error:', err);
    // Return empty data instead of 500 error - don't block app
    res.status(200).json({ enquiries: [], count: 0, error: 'Data temporarily unavailable' });
  }
});

module.exports = router;

