const express = require('express');
const sql = require('mssql');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

// Database connection configuration
let dbConfig = null;

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  // Use the INSTRUCTIONS_SQL_CONNECTION_STRING from .env
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }
  
  // Parse connection string into config object
  const params = new URLSearchParams(connectionString.split(';').join('&'));
  const server = params.get('Server').replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const user = params.get('User ID');
  const password = params.get('Password');
  
  dbConfig = {
    server,
    database, 
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true
    }
  };
  
  return dbConfig;
}

// Database connection pool
let pool;

// Initialize database connection
async function initializeDatabase() {
    if (!pool) {
        const config = await getDbConfig();
        pool = new sql.ConnectionPool(config);
        await pool.connect();
    }
    return pool;
}

/**
 * Get matter details from our database by instruction reference
 */
router.get('/details/:instructionRef', async (req, res) => {
    try {
        const { instructionRef } = req.params;
        
        // Initialize database connection
        await initializeDatabase();
        
        // Query matter details from database
        const result = await pool.request()
            .input('instructionRef', instructionRef)
            .query(`
                SELECT MatterID, InstructionRef, Status, OpenDate, OpenTime, CloseDate,
                       ClientID, RelatedClientID, DisplayNumber, ClientName, ClientType,
                       Description, PracticeArea, ApproxValue, ResponsibleSolicitor,
                       OriginatingSolicitor, SupervisingPartner, Source, Referrer,
                       method_of_contact, OpponentID, OpponentSolicitorID
                FROM Matters 
                WHERE InstructionRef = @instructionRef
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No matter found for this instruction' });
        }
        
        // Return the first matter (there should typically be only one per instruction)
        const matter = result.recordset[0];
        
        // Format dates for display
        if (matter.OpenDate) {
            matter.FormattedOpenDate = new Date(matter.OpenDate).toLocaleDateString('en-GB');
        }
        if (matter.CloseDate) {
            matter.FormattedCloseDate = new Date(matter.CloseDate).toLocaleDateString('en-GB');
        }
        if (matter.OpenTime) {
            // Format time from SQL time format
            const timeStr = matter.OpenTime.toString();
            matter.FormattedOpenTime = timeStr.substring(0, 5); // HH:MM format
        }
        
        res.json(matter);
        
    } catch (error) {
        console.error('Error fetching matter details:', error);
        res.status(500).json({ error: 'Failed to fetch matter details' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
        const cid = await getSecret(`${initials}-clio-v1-clientid`);
        const cs = await getSecret(`${initials}-clio-v1-clientsecret`);
        const rt = await getSecret(`${initials}-clio-v1-refreshtoken`);
        // Use the EU endpoint by default to match credentials
        const clioBase = process.env.CLIO_BASE || 'https://eu.app.clio.com';
        const tokenUrl = `${clioBase}/oauth/token?client_id=${cid}&client_secret=${cs}&grant_type=refresh_token&refresh_token=${rt}`;
        const tr = await fetch(tokenUrl, { method: 'POST' });
        if (!tr.ok) throw new Error(await tr.text());
        const { access_token } = await tr.json();
        const clioApiBase = process.env.CLIO_API_BASE || `${clioBase}/api/v4`;
        const resp = await fetch(`${clioApiBase}/matters/${id}`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const matterData = data?.data || {};
        const displayNumber = matterData.display_number || matterData.number || '';
        const matterNumber = matterData.number || '';

        if (displayNumber) {
            try {
                const db = await initializeDatabase();
                await db.request()
                    .input('matterID', sql.NVarChar(255), id)
                    .input('displayNumber', sql.NVarChar(255), displayNumber)
                    .query(`
                        UPDATE Matters
                        SET DisplayNumber = @displayNumber
                        WHERE MatterID = @matterID
                          AND (DisplayNumber IS NULL OR DisplayNumber = '' OR DisplayNumber <> @displayNumber)
                    `);
            } catch (dbErr) {
                console.warn('Failed to persist display number for matter', id, dbErr?.message || dbErr);
            }
        }

        res.json({
            ok: true,
            matterId: id,
            displayNumber,
            display_number: displayNumber,
            number: matterNumber
        });
    } catch (err) {
        console.error('Matter proxy failed', err);
        res.status(500).json({ error: 'Failed to fetch matter' });
    }
});

/**
 * GET /api/matters/:id/client-email
 * Fetches the client email from Clio using the matter ID or display number
 * If id contains letters, searches by display_number first
 * Returns the client info including email from Clio API
 */
router.get('/:id/client-email', async (req, res) => {
    const { id } = req.params;
    try {
        const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
        const cid = await getSecret(`${initials}-clio-v1-clientid`);
        const cs = await getSecret(`${initials}-clio-v1-clientsecret`);
        const rt = await getSecret(`${initials}-clio-v1-refreshtoken`);
        
        const clioBase = process.env.CLIO_BASE || 'https://eu.app.clio.com';
        const tokenUrl = `${clioBase}/oauth/token?client_id=${cid}&client_secret=${cs}&grant_type=refresh_token&refresh_token=${rt}`;
        const tr = await fetch(tokenUrl, { method: 'POST' });
        if (!tr.ok) throw new Error(await tr.text());
        const { access_token } = await tr.json();
        
        let matterId = id;
        let matter = null;
        
        // Check if id is a display number (contains letters) rather than numeric ID
        const isDisplayNumber = /[a-zA-Z]/.test(id);
        
        if (isDisplayNumber) {
            // Search for matter by display_number
            const searchUrl = `${clioBase}/api/v4/matters?query=${encodeURIComponent(id)}&fields=id,display_number,description,client&limit=10`;
            const searchResp = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            
            if (!searchResp.ok) {
                const errorText = await searchResp.text();
                throw new Error(`Clio search error: ${searchResp.status} - ${errorText}`);
            }
            
            const searchData = await searchResp.json();
            const matters = searchData?.data || [];
            
            // Find exact match by display_number
            matter = matters.find(m => m.display_number === id);
            
            if (!matter) {
                // Try case-insensitive match
                matter = matters.find(m => m.display_number?.toLowerCase() === id.toLowerCase());
            }
            
            if (!matter) {
                return res.status(404).json({ 
                    error: `No matter found with display number: ${id}`,
                    searchResults: matters.length,
                    searchedMatters: matters.map(m => m.display_number)
                });
            }
            
            matterId = matter.id;
        } else {
            // Fetch matter directly by numeric ID
            const matterUrl = `${clioBase}/api/v4/matters/${id}?fields=id,display_number,description,client`;
            const resp = await fetch(matterUrl, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            
            if (!resp.ok) {
                const errorText = await resp.text();
                throw new Error(`Clio API error: ${resp.status} - ${errorText}`);
            }
            
            const data = await resp.json();
            matter = data?.data || {};
        }
        
        const clientRef = matter.client || {};
        let clientDetails = { id: clientRef.id, name: '', primary_email_address: '', primary_phone_number: '' };
        
        // If we have a client ID, fetch full contact details
        if (clientRef.id) {
            const contactUrl = `${clioBase}/api/v4/contacts/${clientRef.id}?fields=id,name,primary_email_address,primary_phone_number`;
            const contactResp = await fetch(contactUrl, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            
            if (contactResp.ok) {
                const contactData = await contactResp.json();
                clientDetails = contactData?.data || clientDetails;
            } else {
                console.warn(`Could not fetch contact ${clientRef.id}:`, await contactResp.text());
            }
        }
        
        res.json({
            ok: true,
            matterId: matterId,
            displayNumber: matter.display_number,
            description: matter.description,
            clientId: clientDetails.id?.toString() || '',
            clientName: clientDetails.name || '',
            clientEmail: clientDetails.primary_email_address || '',
            clientPhone: clientDetails.primary_phone_number || ''
        });
    } catch (err) {
        console.error('Failed to fetch client email for matter', id, err?.message || err);
        res.status(500).json({ error: err.message || 'Failed to fetch client email' });
    }
});

/**
 * GET /api/matters/enquiry-lookup/:email
 * Searches for an email in both enquiries tables:
 * - Legacy (helix-core-data): enquiries table
 * - Instructions DB: enquiries table
 * Returns matches from both sources to help bridge matter-enquiry relationships
 */
router.get('/enquiry-lookup/:email', async (req, res) => {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    
    const results = {
        legacy: { found: false, count: 0, matches: [], error: null },
        instructions: { found: false, count: 0, matches: [], error: null }
    };
    
    // Search Legacy DB (helix-core-data)
    const legacyConnStr = process.env.SQL_CONNECTION_STRING;
    if (legacyConnStr) {
        try {
            const pool = await new sql.ConnectionPool(legacyConnStr).connect();
            try {
                const result = await pool.request()
                    .input('email', sql.NVarChar(255), email.toLowerCase())
                    .query(`
                        SELECT TOP 10 
                            ID as id, 
                            First_Name as first, 
                            Last_Name as last, 
                            Email as email, 
                            Area_of_Work as aow, 
                            Type_of_Work as tow, 
                            Touchpoint_Date as datetime, 
                            NULL as stage, 
                            Point_of_Contact as poc, 
                            NULL as acid,
                            Ultimate_Source as source,
                            Campaign as campaign,
                            Ad_Group as adSet,
                            Search_Keyword as keyword,
                            Referral_URL as url,
                            GCLID as gclid,
                            Phone_Number as phone
                        FROM enquiries WITH (NOLOCK)
                        WHERE LOWER(Email) = @email
                        ORDER BY Touchpoint_Date DESC
                    `);
                const rows = result.recordset || [];
                results.legacy = {
                    found: rows.length > 0,
                    count: rows.length,
                    matches: rows.map(r => ({
                        id: r.id,
                        name: [r.first, r.last].filter(Boolean).join(' ') || null,
                        email: r.email,
                        aow: r.aow,
                        tow: r.tow,
                        date: r.datetime,
                        stage: r.stage,
                        poc: r.poc,
                        acid: r.acid,
                        source: r.source,
                        campaign: r.campaign,
                        adSet: r.adSet,
                        keyword: r.keyword,
                        url: r.url,
                        gclid: r.gclid,
                        phone: r.phone
                    })),
                    error: null
                };
            } finally {
                await pool.close();
            }
        } catch (err) {
            console.error('Legacy enquiry lookup failed:', err.message);
            results.legacy.error = err.message;
        }
    } else {
        results.legacy.error = 'Legacy DB not configured';
    }
    
    // Search Instructions DB
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (instructionsConnStr) {
        try {
            const pool = await new sql.ConnectionPool(instructionsConnStr).connect();
            try {
                const result = await pool.request()
                    .input('email', sql.NVarChar(255), email.toLowerCase())
                    .query(`
                        SELECT TOP 10 
                            id, first, last, email, aow, tow, datetime, stage, poc, acid,
                            source, url, phone, gclid,
                            NULL as campaign,
                            NULL as adSet,
                            NULL as keyword
                        FROM enquiries WITH (NOLOCK)
                        WHERE LOWER(email) = @email
                        ORDER BY datetime DESC
                    `);
                const rows = result.recordset || [];
                results.instructions = {
                    found: rows.length > 0,
                    count: rows.length,
                    matches: rows.map(r => ({
                        id: r.id,
                        name: [r.first, r.last].filter(Boolean).join(' ') || null,
                        email: r.email,
                        aow: r.aow,
                        tow: r.tow,
                        date: r.datetime,
                        stage: r.stage,
                        poc: r.poc,
                        acid: r.acid,
                        source: r.source,
                        campaign: r.campaign,
                        adSet: r.adSet,
                        keyword: r.keyword,
                        url: r.url,
                        gclid: r.gclid,
                        phone: r.phone
                    })),
                    error: null
                };
            } finally {
                await pool.close();
            }
        } catch (err) {
            console.error('Instructions enquiry lookup failed:', err.message);
            results.instructions.error = err.message;
        }
    } else {
        results.instructions.error = 'Instructions DB not configured';
    }
    
    res.json({
        ok: true,
        email,
        legacy: results.legacy,
        instructions: results.instructions,
        summary: {
            totalMatches: results.legacy.count + results.instructions.count,
            foundInLegacy: results.legacy.found,
            foundInInstructions: results.instructions.found
        }
    });
});

module.exports = router;