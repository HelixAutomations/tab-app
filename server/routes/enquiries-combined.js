const express = require('express');
const { getSecret } = require('../utils/getSecret');
const sql = require('mssql');
const router = express.Router();

// Route: GET /api/enquiries-combined
// Fetches from BOTH the legacy Azure Function (getEnquiries) AND the new decoupled function (fetchEnquiriesData)
router.get('/', async (req, res) => {
  try {
    const allEnquiries = [];
    const sources = {
      legacy: 0,
      new: 0,
      combined: 0,
      errors: []
    };

    // Try to get the function codes for both functions
    let legacyFunctionCode, newFunctionCode;
    
    try {
      [legacyFunctionCode, newFunctionCode] = await Promise.all([
        getSecret('getEnquiries-code').catch(() => null), // Legacy Azure Function
        getSecret('fetchEnquiriesData-code').catch(() => null) // New decoupled function
      ]);
    } catch (kvError) {
      console.error('[Enquiries Combined] Failed to get function codes:', kvError.message);
      sources.errors.push('Function authentication failed');
    }

    // Fetch from legacy Azure Function (getEnquiries)
    if (legacyFunctionCode) {
      try {
        // Call the legacy getEnquiries function with parameters
        const legacyUrl = `https://instructions-vnet-functions.azurewebsites.net/api/getEnquiries?code=${legacyFunctionCode}`;
        
        const legacyResponse = await fetch(legacyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'anyone', // Get all enquiries
            dateFrom: '2020-01-01', // Wide date range
            dateTo: '2030-12-31'
          })
        });
        
        if (legacyResponse.ok) {
          const legacyData = await legacyResponse.json();
          
          let legacyEnquiries = [];
          if (Array.isArray(legacyData)) {
            legacyEnquiries = legacyData;
          } else if (Array.isArray(legacyData.enquiries)) {
            legacyEnquiries = legacyData.enquiries;
          }
          
          // Tag legacy enquiries with source and map Ultimate_Source to source field for enquiry cards
          legacyEnquiries = legacyEnquiries.map(enq => ({
            ...enq,
            _source: 'legacy-getEnquiries',
            // Map Ultimate_Source to source field that enquiry cards expect
            source: enq.Ultimate_Source || enq.source || null
          }));
          
          allEnquiries.push(...legacyEnquiries);
          sources.legacy = legacyEnquiries.length;
        } else {
          const errorText = await legacyResponse.text();
          console.warn('[Enquiries Combined] Legacy function call failed:', legacyResponse.status, errorText);
          sources.errors.push(`Legacy function: ${legacyResponse.status}`);
        }
      } catch (legacyError) {
        console.warn('[Enquiries Combined] Error calling legacy function:', legacyError.message);
        sources.errors.push(`Legacy function error: ${legacyError.message}`);
      }
    }

    // Fetch from new decoupled function (fetchEnquiriesData)
    if (newFunctionCode) {
      try {
        // Call the new fetchEnquiriesData function
        const newUrl = `https://instructions-vnet-functions.azurewebsites.net/api/fetchEnquiriesData?code=${newFunctionCode}`;
        
        const newResponse = await fetch(newUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (newResponse.ok) {
          const newData = await newResponse.json();
          
          let newEnquiries = [];
          if (Array.isArray(newData)) {
            newEnquiries = newData;
          } else if (Array.isArray(newData.enquiries)) {
            newEnquiries = newData.enquiries;
          }
          
          // Tag new enquiries with source
          newEnquiries = newEnquiries.map(enq => ({
            ...enq,
            _source: 'new-fetchEnquiriesData'
          }));
          
          allEnquiries.push(...newEnquiries);
          sources.new = newEnquiries.length;
        } else {
          const errorText = await newResponse.text();
          console.warn('[Enquiries Combined] New function call failed:', newResponse.status, errorText);
          sources.errors.push(`New function: ${newResponse.status}`);
        }
      } catch (newError) {
        console.warn('[Enquiries Combined] Error calling new function:', newError.message);
        sources.errors.push(`New function error: ${newError.message}`);
      }
    }

    // Remove duplicates based on ID (prefer newer data)
    const uniqueEnquiries = [];
    const seenIds = new Set();
    
    // Process in reverse order so newer data overwrites older data
    for (let i = allEnquiries.length - 1; i >= 0; i--) {
      const enquiry = allEnquiries[i];
      const enquiryId = enquiry.ID || enquiry.id || enquiry.acid;
      
      if (enquiryId && !seenIds.has(enquiryId)) {
        seenIds.add(enquiryId);
        uniqueEnquiries.unshift(enquiry); // Add to front to maintain order
      } else if (!enquiryId) {
        // Include enquiries without ID (they can't be duplicates)
        uniqueEnquiries.unshift(enquiry);
      }
    }

    sources.combined = uniqueEnquiries.length;
    
    // Return data in expected format
    res.json({
      enquiries: uniqueEnquiries,
      count: uniqueEnquiries.length,
      sources
    });
    
  } catch (err) {
    console.warn('[Enquiries Combined] Error:', err.message);
    // Return empty data instead of 500 error - don't block app
    res.status(200).json({ 
      enquiries: [], 
      count: 0, 
      error: 'Combined data temporarily unavailable',
      sources: {
        legacy: 0,
        new: 0,
        combined: 0,
        errors: [err.message]
      }
    });
  }
});

module.exports = router;
