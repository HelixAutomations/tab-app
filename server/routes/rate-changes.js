// Rate Change Notifications API
// Tracks client notifications for annual rate increases

const express = require('express');
const router = express.Router();
const { withRequest, sql } = require('../utils/db');
const fetch = global.fetch || require('node-fetch');

// Custom field ID for "2026 Rate Change" date field in Clio
// Discovered via discover-rate-change-field.js script
const RATE_CHANGE_DATE_FIELD_ID = process.env.CLIO_RATE_CHANGE_FIELD_ID || '463462';

// N/A date marker - very old date to indicate not applicable
const NA_DATE = '1970-01-01';

/**
 * Helper: Get Clio access token
 */
async function getClioAccessToken() {
    const { getSecret } = require('../utils/getSecret');
    const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
    const [clientId, clientSecret, refreshToken] = await Promise.all([
        getSecret(`${initials}-clio-v1-clientid`),
        getSecret(`${initials}-clio-v1-clientsecret`),
        getSecret(`${initials}-clio-v1-refreshtoken`),
    ]);
    
    const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
    const tokenResp = await fetch(tokenUrl, { method: 'POST' });
    if (!tokenResp.ok) throw new Error('Failed to get Clio access token');
    const { access_token } = await tokenResp.json();
    return access_token;
}

/**
 * Helper: Update a single matter's rate change date in Clio
 * Handles both new field values and updates to existing values
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateSingleMatterRateChangeDate(matterId, displayNumber, dateValue, accessToken, fieldId) {
    const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
    
    try {
        // First, fetch existing custom field values to get the value ID if it exists
        const matterUrl = `${clioBase}/matters/${matterId}.json?fields=custom_field_values{id,custom_field}`;
        const matterResp = await fetch(matterUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        let existingValueId = null;
        if (matterResp.ok) {
            const matterData = await matterResp.json();
            const existingValues = matterData.data?.custom_field_values || [];
            const existingField = existingValues.find(v => v.custom_field?.id === fieldId);
            if (existingField) {
                existingValueId = existingField.id;
                console.log(`[rate-changes] Found existing field value id=${existingValueId} for matter ${displayNumber}`);
            }
        }
        
        // Build the custom field value object
        const customFieldValue = {
            custom_field: { id: fieldId },
            value: dateValue
        };
        
        // If updating existing value, include the value ID
        if (existingValueId) {
            customFieldValue.id = existingValueId;
        }
        
        const updateUrl = `${clioBase}/matters/${matterId}.json`;
        const updateResp = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    custom_field_values: [customFieldValue]
                }
            })
        });
        
        if (updateResp.ok) {
            console.log(`[rate-changes] ✓ Updated matter ${displayNumber} (${matterId})${existingValueId ? ' [overwrite]' : ''}`);
            return { success: true };
        } else if (updateResp.status === 404) {
            // Matter not found in Clio - treat as success (test matter or not synced to Clio)
            console.log(`[rate-changes] ⊘ Matter ${displayNumber} not in Clio (404) - skipping`);
            return { success: true, skipped: true };
        } else {
            const errorText = await updateResp.text();
            console.error(`[rate-changes] ✗ Failed matter ${displayNumber}: ${updateResp.status} - ${errorText.substring(0, 200)}`);
            return { success: false, error: `${updateResp.status}: ${errorText.substring(0, 100)}` };
        }
    } catch (err) {
        console.error(`[rate-changes] ✗ Error updating matter ${displayNumber}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Helper: Update "Date of Rate Change" custom field on multiple matters (non-streaming version)
 */
async function updateClioMattersRateChangeDate(matterIds, dateValue, customFieldId = null) {
    const results = { success: 0, failed: 0, errors: [], skipped: 0 };
    
    if (!matterIds || matterIds.length === 0) {
        console.log('[rate-changes] No matter IDs to update');
        return results;
    }
    
    let fieldId = customFieldId || RATE_CHANGE_DATE_FIELD_ID;
    if (!fieldId) {
        results.skipped = matterIds.length;
        return results;
    }
    
    fieldId = parseInt(fieldId);
    
    try {
        const accessToken = await getClioAccessToken();
        
        for (const matterId of matterIds) {
            const result = await updateSingleMatterRateChangeDate(matterId, matterId, dateValue, accessToken, fieldId);
            if (result.success) {
                if (result.skipped) {
                    results.skipped++;
                } else {
                    results.success++;
                }
            } else {
                results.failed++;
                results.errors.push(`${matterId}: ${result.error}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (err) {
        console.error('[rate-changes] Auth error:', err);
        results.errors.push(`Auth error: ${err.message}`);
        results.failed = matterIds.length;
    }
    
    return results;
}

/**
 * GET /api/rate-changes/verify-matter/:displayNumber
 * Verify a matter's responsible/originating attorney against Clio
 * Used for lazy-loading verification to detect SQL vs Clio mismatches
 * NOTE: Must be defined BEFORE /:year route to prevent route matching issues
 */
router.get('/verify-matter/:displayNumber', async (req, res) => {
    const { displayNumber } = req.params;
    const { getSecret } = require('../utils/getSecret');
    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    
    try {
        // 1. First lookup the Clio matter ID from SQL (more reliable than search)
        let clioMatterId = null;
        if (legacyConn) {
            try {
                const sqlResult = await withRequest(legacyConn, async (request) => {
                    request.input('displayNumber', sql.NVarChar, displayNumber);
                    const result = await request.query(`
                        SELECT [Unique ID] as clio_id
                        FROM matters
                        WHERE [Display Number] = @displayNumber
                    `);
                    return result.recordset?.[0];
                });
                clioMatterId = sqlResult?.clio_id;
            } catch (sqlErr) {
                console.log('[verify-matter] SQL lookup failed, falling back to search:', sqlErr.message);
            }
        }
        
        const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
        const [clientId, clientSecret, refreshToken] = await Promise.all([
            getSecret(`${initials}-clio-v1-clientid`),
            getSecret(`${initials}-clio-v1-clientsecret`),
            getSecret(`${initials}-clio-v1-refreshtoken`),
        ]);
        
        const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        if (!tokenResp.ok) throw new Error('Failed to get Clio access token');
        const { access_token } = await tokenResp.json();
        
        let matter = null;
        
        // 2. Try direct ID lookup first (most reliable)
        if (clioMatterId) {
            const directUrl = `${clioBase}/matters/${clioMatterId}?fields=id,display_number,responsible_attorney{id,name},originating_attorney{id,name},status`;
            const directResp = await fetch(directUrl, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            
            if (directResp.ok) {
                const directData = await directResp.json();
                matter = directData.data;
            }
        }
        
        // 3. Fall back to search if direct lookup failed
        if (!matter) {
            const searchUrl = `${clioBase}/matters?query=${encodeURIComponent(displayNumber)}&fields=id,display_number,responsible_attorney{id,name},originating_attorney{id,name},status`;
            const searchResp = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            
            if (!searchResp.ok) {
                throw new Error(`Clio search failed: ${searchResp.status}`);
            }
            
            const searchData = await searchResp.json();
            matter = searchData.data?.find(m => m.display_number === displayNumber);
        }
        
        if (!matter) {
            return res.status(404).json({ error: 'Matter not found in Clio', displayNumber });
        }
        
        res.json({
            display_number: matter.display_number,
            responsible_attorney: matter.responsible_attorney,
            originating_attorney: matter.originating_attorney,
            status: matter.status,
        });
        
    } catch (error) {
        console.error('[rate-changes] Error verifying matter:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/sync-matter/:displayNumber
 * Sync a matter's responsible/originating attorney from Clio to SQL
 * Updates the local SQL database with current Clio data
 */
router.post('/sync-matter/:displayNumber', async (req, res) => {
    const { displayNumber } = req.params;
    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    
    if (!legacyConn) {
        return res.status(500).json({ error: 'Missing legacy database connection string' });
    }
    
    try {
        // 1. First lookup the Clio matter ID from SQL (more reliable than search)
        let clioMatterId = null;
        const sqlLookup = await withRequest(legacyConn, async (request) => {
            request.input('displayNumber', sql.NVarChar, displayNumber);
            const result = await request.query(`
                SELECT [Unique ID] as clio_id
                FROM matters
                WHERE [Display Number] = @displayNumber
            `);
            return result.recordset?.[0];
        });
        clioMatterId = sqlLookup?.clio_id;
        
        // 2. Get current data from Clio
        const accessToken = await getClioAccessToken();
        const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
        
        let matter = null;
        
        // Try direct ID lookup first (most reliable)
        if (clioMatterId) {
            const directUrl = `${clioBase}/matters/${clioMatterId}?fields=id,display_number,responsible_attorney{id,name},originating_attorney{id,name},status`;
            const directResp = await fetch(directUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (directResp.ok) {
                const directData = await directResp.json();
                matter = directData.data;
            }
        }
        
        // Fall back to search if direct lookup failed
        if (!matter) {
            const searchUrl = `${clioBase}/matters?query=${encodeURIComponent(displayNumber)}&fields=id,display_number,responsible_attorney{id,name},originating_attorney{id,name},status`;
            const searchResp = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (!searchResp.ok) {
                throw new Error(`Clio search failed: ${searchResp.status}`);
            }
            
            const searchData = await searchResp.json();
            matter = searchData.data?.find(m => m.display_number === displayNumber);
        }
        
        if (!matter) {
            return res.status(404).json({ error: 'Matter not found in Clio', displayNumber });
        }
        
        const clioResponsible = matter.responsible_attorney?.name || null;
        const clioOriginating = matter.originating_attorney?.name || null;
        
        // 3. Update SQL database
        const updateResult = await withRequest(legacyConn, async (request) => {
            request.input('displayNumber', sql.NVarChar, displayNumber);
            request.input('responsible', sql.NVarChar, clioResponsible);
            request.input('originating', sql.NVarChar, clioOriginating);
            
            const result = await request.query(`
                UPDATE matters
                SET [Responsible Solicitor] = @responsible,
                    [Originating Solicitor] = @originating
                WHERE [Display Number] = @displayNumber
            `);
            return result.rowsAffected[0] || 0;
        });
        
        console.log(`[rate-changes] Synced ${displayNumber}: Resp="${clioResponsible}", Orig="${clioOriginating}" (${updateResult} rows)`);
        
        res.json({
            success: true,
            display_number: displayNumber,
            updated: {
                responsible_solicitor: clioResponsible,
                originating_solicitor: clioOriginating,
            },
            rows_affected: updateResult,
        });
        
    } catch (error) {
        console.error('[rate-changes] Error syncing matter:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/sync-matters
 * Bulk sync multiple matters from Clio to SQL
 * Accepts array of display numbers in request body
 */
router.post('/sync-matters', async (req, res) => {
    const { displayNumbers } = req.body;
    
    if (!displayNumbers || !Array.isArray(displayNumbers) || displayNumbers.length === 0) {
        return res.status(400).json({ error: 'displayNumbers array required' });
    }
    
    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    
    if (!legacyConn) {
        return res.status(500).json({ error: 'Missing legacy database connection string' });
    }
    
    // Set up SSE for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    try {
        const accessToken = await getClioAccessToken();
        const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
        
        const results = { success: 0, failed: 0, notFound: 0, total: displayNumbers.length };
        
        for (let i = 0; i < displayNumbers.length; i++) {
            const displayNumber = displayNumbers[i];
            
            sendEvent({ 
                type: 'progress', 
                current: i + 1, 
                total: displayNumbers.length,
                displayNumber,
                step: 'fetching'
            });
            
            try {
                // Fetch from Clio
                const searchUrl = `${clioBase}/matters?query=${encodeURIComponent(displayNumber)}&fields=id,display_number,responsible_attorney{id,name},originating_attorney{id,name}`;
                const searchResp = await fetch(searchUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (!searchResp.ok) {
                    throw new Error(`Clio API error: ${searchResp.status}`);
                }
                
                const searchData = await searchResp.json();
                const matter = searchData.data?.find(m => m.display_number === displayNumber);
                
                if (!matter) {
                    results.notFound++;
                    sendEvent({ 
                        type: 'matter', 
                        displayNumber, 
                        status: 'not_found',
                        current: i + 1
                    });
                    continue;
                }
                
                const clioResponsible = matter.responsible_attorney?.name || null;
                const clioOriginating = matter.originating_attorney?.name || null;
                
                sendEvent({ 
                    type: 'progress', 
                    current: i + 1, 
                    total: displayNumbers.length,
                    displayNumber,
                    step: 'updating'
                });
                
                // Update SQL
                await withRequest(legacyConn, async (request) => {
                    request.input('displayNumber', sql.NVarChar, displayNumber);
                    request.input('responsible', sql.NVarChar, clioResponsible);
                    request.input('originating', sql.NVarChar, clioOriginating);
                    
                    await request.query(`
                        UPDATE matters
                        SET [Responsible Solicitor] = @responsible,
                            [Originating Solicitor] = @originating
                        WHERE [Display Number] = @displayNumber
                    `);
                });
                
                results.success++;
                sendEvent({ 
                    type: 'matter', 
                    displayNumber, 
                    status: 'success',
                    responsible: clioResponsible,
                    originating: clioOriginating,
                    current: i + 1
                });
                
            } catch (err) {
                results.failed++;
                sendEvent({ 
                    type: 'matter', 
                    displayNumber, 
                    status: 'error',
                    error: err.message,
                    current: i + 1
                });
            }
        }
        
        sendEvent({ type: 'complete', results });
        res.end();
        
    } catch (error) {
        console.error('[rate-changes] Error in bulk sync:', error);
        sendEvent({ type: 'error', error: error.message });
        res.end();
    }
});

/**
 * GET /api/rate-changes/clio/custom-fields
 * Get Clio custom fields for matters to find the "Date of Rate Change" field
 * NOTE: Must be defined BEFORE /:year route to prevent route matching issues
 */
router.get('/clio/custom-fields', async (req, res) => {
    const { getSecret } = require('../utils/getSecret');
    
    try {
        const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
        const [clientId, clientSecret, refreshToken] = await Promise.all([
            getSecret(`${initials}-clio-v1-clientid`),
            getSecret(`${initials}-clio-v1-clientsecret`),
            getSecret(`${initials}-clio-v1-refreshtoken`),
        ]);
        
        const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        if (!tokenResp.ok) throw new Error('Failed to get Clio access token');
        const { access_token } = await tokenResp.json();
        
        // Get custom fields for matters
        const cfUrl = `${clioBase}/custom_fields.json?fields=id,name,parent_type,field_type,displayed,deleted&parent_type=Matter`;
        const cfResp = await fetch(cfUrl, {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        
        if (!cfResp.ok) {
            throw new Error(`Failed to get custom fields: ${cfResp.status}`);
        }
        
        const cfData = await cfResp.json();
        const fields = (cfData.data || []).filter(f => !f.deleted);
        
        // Find rate change related fields
        const rateChangeFields = fields.filter(f => 
            f.name.toLowerCase().includes('rate') || 
            f.name.toLowerCase().includes('change')
        );
        
        res.json({
            all_fields: fields,
            rate_change_fields: rateChangeFields,
            suggested_field: rateChangeFields.find(f => 
                f.name.toLowerCase().includes('date') && f.name.toLowerCase().includes('rate')
            ) || null
        });
        
    } catch (error) {
        console.error('[rate-changes] Error fetching custom fields:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/clio/update-matter
 * Update a matter's custom field for Date of Rate Change
 * NOTE: Must be defined BEFORE /:year route to prevent route matching issues
 */
router.post('/clio/update-matter', async (req, res) => {
    const { getSecret } = require('../utils/getSecret');
    const { matter_id, custom_field_id, date_value } = req.body;
    
    if (!matter_id || !custom_field_id) {
        return res.status(400).json({ error: 'matter_id and custom_field_id required' });
    }
    
    try {
        const initials = (process.env.CLIO_USER_INITIALS || 'lz').toLowerCase();
        const [clientId, clientSecret, refreshToken] = await Promise.all([
            getSecret(`${initials}-clio-v1-clientid`),
            getSecret(`${initials}-clio-v1-clientsecret`),
            getSecret(`${initials}-clio-v1-refreshtoken`),
        ]);
        
        const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        if (!tokenResp.ok) throw new Error('Failed to get Clio access token');
        const { access_token } = await tokenResp.json();
        
        // Update matter with custom field value
        const updateUrl = `${clioBase}/matters/${matter_id}.json`;
        const updateResp = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    custom_field_values: [{
                        custom_field: { id: parseInt(custom_field_id) },
                        value: date_value || new Date().toISOString().split('T')[0]
                    }]
                }
            })
        });
        
        if (!updateResp.ok) {
            if (updateResp.status === 404) {
                // Matter not found in Clio - treat as success (test matter or not synced)
                console.log(`[rate-changes] ⊘ Matter ${matter_id} not in Clio (404) - skipping`);
                return res.json({ success: true, skipped: true, message: 'Matter not in Clio' });
            }
            const errorText = await updateResp.text();
            throw new Error(`Clio update failed: ${updateResp.status} - ${errorText}`);
        }
        
        const result = await updateResp.json();
        res.json({ success: true, matter: result.data });
        
    } catch (error) {
        console.error('[rate-changes] Error updating matter:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/rate-changes/:year
 * Get all clients with open matters and their notification status for a given year
 * Joins legacy matters with tracking records from instructions DB
 * Returns open matters for the notification list, plus closed matters for context
 */
router.get('/:year', async (req, res) => {
    const { year } = req.params;
    const { status, solicitor } = req.query;

    
    const normalizeClientId = (value) => {
        if (value === null || value === undefined) return null;
        return String(value).trim();
    };
    
    // Connection strings from environment
    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!legacyConn || !instructionsConn) {
        return res.status(500).json({ error: 'Missing database connection strings' });
    }
    
    try {
        // 1. Get all OPEN matters grouped by client from legacy DB
        const openMattersResult = await withRequest(legacyConn, async (request) => {
            const result = await request.query(`
                SELECT 
                    [Client ID] as client_id,
                    [Client Name] as client_name,
                    [Unique ID] as matter_id,
                    [Display Number] as display_number,
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor,
                    [Practice Area] as practice_area,
                    [Status] as status,
                    [Open Date] as open_date,
                    [CCL_date] as ccl_date
                FROM matters
                WHERE [Status] = 'Open'
                ORDER BY [Client Name], [Display Number]
            `);
            return result.recordset || [];
        });
        
        // 2. Get client IDs that have open matters
        const clientIdsWithOpenMatters = new Set(
            openMattersResult.map(m => normalizeClientId(m.client_id)).filter(Boolean)
        );
        
        // 3. Get ALL matters (including closed) for those clients - for context in modal
        const allMattersResult = await withRequest(legacyConn, async (request) => {
            const result = await request.query(`
                SELECT 
                    [Client ID] as client_id,
                    [Unique ID] as matter_id,
                    [Display Number] as display_number,
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor,
                    [Practice Area] as practice_area,
                    [Status] as status,
                    [Open Date] as open_date,
                    [Close Date] as close_date,
                    [CCL_date] as ccl_date
                FROM matters
                ORDER BY [Client ID], [Display Number]
            `);
            return result.recordset || [];
        });
        
        // 4. Get tracking records from instructions DB
        const trackingResult = await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            const result = await request.query(`
                SELECT 
                    client_id,
                    client_first_name,
                    client_last_name,
                    client_email,
                    matter_ids,
                    display_numbers,
                    status,
                    sent_date,
                    sent_by,
                    escalated_at,
                    escalated_by,
                    na_reason,
                    na_notes,
                    updated_at
                FROM rate_change_notifications
                WHERE rate_change_year = @year
            `);
            return result.recordset || [];
        });
        
        // 5. Build tracking lookup - ensure string keys for consistent lookup
        const trackingByClient = new Map();
        trackingResult.forEach(t => {
            const trackingClientId = normalizeClientId(t.client_id);
            if (trackingClientId) {
                trackingByClient.set(trackingClientId, t);
            }
        });
        
        console.log(`[rate-changes] Year ${year}: Found ${trackingResult.length} tracking records, mapped ${trackingByClient.size} clients`);
        if (trackingResult.length > 0) {
            console.log(`[rate-changes] Sample tracking client_ids:`, trackingResult.slice(0, 3).map(t => ({ id: t.client_id, status: t.status })));
        }
        
        // 6. Build closed matters lookup by client (only for clients with open matters)
        const closedMattersByClient = new Map();
        allMattersResult.forEach(m => {
            const clientId = normalizeClientId(m.client_id);
            if (!clientId || !clientIdsWithOpenMatters.has(clientId)) return;
            if (m.status !== 'Closed') return;
            
            if (!closedMattersByClient.has(clientId)) {
                closedMattersByClient.set(clientId, []);
            }
            closedMattersByClient.get(clientId).push({
                matter_id: m.matter_id,
                display_number: m.display_number,
                responsible_solicitor: m.responsible_solicitor,
                originating_solicitor: m.originating_solicitor,
                practice_area: m.practice_area,
                status: 'Closed',
                open_date: m.open_date,
                close_date: m.close_date
            });
        });
        
        // 7. Group open matters by client
        const clientsMap = new Map();
        openMattersResult.forEach(m => {
            const clientId = normalizeClientId(m.client_id);
            if (!clientId) return;
            
            if (!clientsMap.has(clientId)) {
                clientsMap.set(clientId, {
                    client_id: clientId,
                    client_name: m.client_name,
                    open_matters: [],
                    closed_matters: [],
                    responsible_solicitors: new Set(),
                    originating_solicitors: new Set()
                });
            }
            
            const client = clientsMap.get(clientId);
            client.open_matters.push({
                matter_id: m.matter_id,
                display_number: m.display_number,
                responsible_solicitor: m.responsible_solicitor,
                originating_solicitor: m.originating_solicitor,
                practice_area: m.practice_area,
                status: 'Open',
                open_date: m.open_date,
                ccl_date: m.ccl_date
            });
            if (m.responsible_solicitor) {
                client.responsible_solicitors.add(m.responsible_solicitor);
            }
            if (m.originating_solicitor) {
                client.originating_solicitors.add(m.originating_solicitor);
            }
        });
        
        // 8. Add closed matters to each client
        clientsMap.forEach((client, clientId) => {
            client.closed_matters = closedMattersByClient.get(clientId) || [];
        });
        
        // Debug: log sample of client IDs from both sources
        const sampleClientIds = Array.from(clientsMap.keys()).slice(0, 3);
        console.log(`[rate-changes] Sample open matter client_ids:`, sampleClientIds);
        sampleClientIds.forEach(cid => {
            const hasTracking = trackingByClient.has(cid);
            console.log(`[rate-changes] Client ${cid}: has tracking = ${hasTracking}`);
        });
        
        // 9. Merge with tracking data
        const results = [];
        let matchCount = 0;
        clientsMap.forEach((client, clientId) => {
            const tracking = trackingByClient.get(clientId);
            if (tracking) matchCount++;
            
            const record = {
                client_id: clientId,
                client_name: client.client_name,
                client_first_name: tracking?.client_first_name || null,
                client_last_name: tracking?.client_last_name || null,
                client_email: tracking?.client_email || null,
                open_matters: client.open_matters,
                closed_matters: client.closed_matters,
                responsible_solicitors: Array.from(client.responsible_solicitors),
                originating_solicitors: Array.from(client.originating_solicitors),
                status: tracking?.status || 'pending',
                sent_date: tracking?.sent_date || null,
                sent_by: tracking?.sent_by || null,
                escalated_at: tracking?.escalated_at || null,
                escalated_by: tracking?.escalated_by || null,
                na_reason: tracking?.na_reason || null,
                na_notes: tracking?.na_notes || null,
                updated_at: tracking?.updated_at || null,
                ccl_confirmed: Array.isArray(client.open_matters) && client.open_matters.some(m => m.ccl_date)
            };

            
            // Apply filters
            if (status && record.status !== status) return;
            if (solicitor && !record.responsible_solicitors.includes(solicitor)) return;
            
            results.push(record);
        });
        
        // 6. Sort: pending first, then by client name
        results.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return (a.client_name || '').localeCompare(b.client_name || '');
        });
        
        // 7. Calculate stats
        const stats = {
            total: results.length,
            pending: results.filter(r => r.status === 'pending').length,
            sent: results.filter(r => r.status === 'sent').length,
            not_applicable: results.filter(r => r.status === 'not_applicable').length
        };
        
        console.log(`[rate-changes] Final stats for year ${year}:`, stats, `| Tracking matches: ${matchCount}/${trackingByClient.size}`);
        
        res.json({
            year: parseInt(year),
            stats,
            clients: results
        });
        
    } catch (error) {
        console.error('[rate-changes] Error fetching data:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/:year/mark-escalated
 * Persist that an escalation email was sent (with date)
 */
router.post('/:year/mark-escalated', async (req, res) => {
    const { year } = req.params;
    const { client_id, escalated_by } = req.body;

    if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
    }

    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        return res.status(500).json({ error: 'Missing instructions database connection string' });
    }

    try {
        const now = new Date();

        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('effective_date', sql.Date, new Date(`${year}-01-01`));
            request.input('client_id', sql.NVarChar, client_id);
            request.input('escalated_by', sql.NVarChar, escalated_by || null);
            request.input('escalated_at', sql.DateTime2, now);

            await request.query(`
                MERGE rate_change_notifications AS target
                USING (SELECT @year AS rate_change_year, @client_id AS client_id) AS source
                ON target.rate_change_year = source.rate_change_year AND target.client_id = source.client_id
                WHEN MATCHED THEN
                    UPDATE SET
                        escalated_at = @escalated_at,
                        escalated_by = @escalated_by,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (rate_change_year, effective_date, client_id, status, escalated_at, escalated_by)
                    VALUES (@year, @effective_date, @client_id, 'pending', @escalated_at, @escalated_by);
            `);
        });

        res.json({
            success: true,
            client_id,
            escalated_at: now.toISOString(),
            escalated_by: escalated_by || null
        });
    } catch (error) {
        console.error('[rate-changes] Error marking escalated:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/:year/mark-sent
 * Mark a client's notification as sent
 */
router.post('/:year/mark-sent', async (req, res) => {
    const { year } = req.params;
    const { 
        client_id, 
        client_first_name, 
        client_last_name, 
        client_email,
        matter_ids,
        display_numbers,
        sent_by 
    } = req.body;
    
    if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
    }
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        return res.status(500).json({ error: 'Missing instructions database connection string' });
    }
    
    try {
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('effective_date', sql.Date, new Date(`${year}-01-01`));
            request.input('client_id', sql.NVarChar, client_id);
            request.input('client_first_name', sql.NVarChar, client_first_name || null);
            request.input('client_last_name', sql.NVarChar, client_last_name || null);
            request.input('client_email', sql.NVarChar, client_email || null);
            request.input('matter_ids', sql.NVarChar, JSON.stringify(matter_ids || []));
            request.input('display_numbers', sql.NVarChar, JSON.stringify(display_numbers || []));
            request.input('sent_by', sql.NVarChar, sent_by || null);
            request.input('sent_date', sql.Date, new Date());
            
            await request.query(`
                MERGE rate_change_notifications AS target
                USING (SELECT @year AS rate_change_year, @client_id AS client_id) AS source
                ON target.rate_change_year = source.rate_change_year AND target.client_id = source.client_id
                WHEN MATCHED THEN
                    UPDATE SET 
                        status = 'sent',
                        sent_date = @sent_date,
                        sent_by = @sent_by,
                        client_first_name = COALESCE(@client_first_name, client_first_name),
                        client_last_name = COALESCE(@client_last_name, client_last_name),
                        client_email = COALESCE(@client_email, client_email),
                        matter_ids = @matter_ids,
                        display_numbers = @display_numbers,
                        na_reason = NULL,
                        na_notes = NULL,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (rate_change_year, effective_date, client_id, client_first_name, client_last_name, 
                            client_email, matter_ids, display_numbers, status, sent_date, sent_by)
                    VALUES (@year, @effective_date, @client_id, @client_first_name, @client_last_name,
                            @client_email, @matter_ids, @display_numbers, 'sent', @sent_date, @sent_by);
            `);
        });
        
        // Update Clio matters with today's date
        const todayDate = new Date().toISOString().split('T')[0];
        const clioResult = await updateClioMattersRateChangeDate(matter_ids || [], todayDate);
        
        res.json({ 
            success: true, 
            status: 'sent',
            clio_updates: clioResult
        });
        
    } catch (error) {
        console.error('[rate-changes] Error marking sent:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/:year/mark-na
 * Mark a client as not applicable
 */
router.post('/:year/mark-na', async (req, res) => {
    const { year } = req.params;
    const { 
        client_id, 
        client_first_name, 
        client_last_name, 
        client_email,
        matter_ids,
        display_numbers,
        na_reason,
        na_notes,
        marked_by
    } = req.body;
    
    if (!client_id || !na_reason) {
        return res.status(400).json({ error: 'client_id and na_reason required' });
    }
    
    console.log(`[rate-changes] mark-na: client_id="${client_id}" (type: ${typeof client_id}), reason=${na_reason}`);
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        return res.status(500).json({ error: 'Missing instructions database connection string' });
    }
    
    try {
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('effective_date', sql.Date, new Date(`${year}-01-01`));
            request.input('client_id', sql.NVarChar, client_id);
            request.input('client_first_name', sql.NVarChar, client_first_name || null);
            request.input('client_last_name', sql.NVarChar, client_last_name || null);
            request.input('client_email', sql.NVarChar, client_email || null);
            request.input('matter_ids', sql.NVarChar, JSON.stringify(matter_ids || []));
            request.input('display_numbers', sql.NVarChar, JSON.stringify(display_numbers || []));
            request.input('na_reason', sql.NVarChar, na_reason);
            request.input('na_notes', sql.NVarChar, na_notes || null);
            request.input('marked_by', sql.NVarChar, marked_by || null);
            
            await request.query(`
                MERGE rate_change_notifications AS target
                USING (SELECT @year AS rate_change_year, @client_id AS client_id) AS source
                ON target.rate_change_year = source.rate_change_year AND target.client_id = source.client_id
                WHEN MATCHED THEN
                    UPDATE SET 
                        status = 'not_applicable',
                        na_reason = @na_reason,
                        na_notes = @na_notes,
                        sent_by = @marked_by,
                        client_first_name = COALESCE(@client_first_name, client_first_name),
                        client_last_name = COALESCE(@client_last_name, client_last_name),
                        client_email = COALESCE(@client_email, client_email),
                        matter_ids = @matter_ids,
                        display_numbers = @display_numbers,
                        sent_date = NULL,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (rate_change_year, effective_date, client_id, client_first_name, client_last_name,
                            client_email, matter_ids, display_numbers, status, na_reason, na_notes, sent_by)
                    VALUES (@year, @effective_date, @client_id, @client_first_name, @client_last_name,
                            @client_email, @matter_ids, @display_numbers, 'not_applicable', @na_reason, @na_notes, @marked_by);
            `);
        });
        
        // Update Clio matters with N/A marker date (1970-01-01)
        const clioResult = await updateClioMattersRateChangeDate(matter_ids || [], NA_DATE);
        
        res.json({ 
            success: true, 
            status: 'not_applicable',
            clio_updates: clioResult
        });
        
    } catch (error) {
        console.error('[rate-changes] Error marking N/A:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rate-changes/:year/mark-sent-stream
 * Mark as sent with SSE streaming for real-time Clio updates
 */
router.post('/:year/mark-sent-stream', async (req, res) => {
    const { year } = req.params;
    const { 
        client_id, 
        client_first_name, 
        client_last_name, 
        client_email,
        matter_ids,
        display_numbers,
        sent_by,
        sent_date 
    } = req.body;
    
    console.log(`[rate-changes] mark-sent-stream: client_id="${client_id}", matters=${(matter_ids || []).length}, sent_date=${sent_date}`);
    
    if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
    }
    
    // Parse the sent_date or default to today
    const parsedSentDate = sent_date ? new Date(sent_date) : new Date();
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Disable any response buffering
    if (res.socket) {
        res.socket.setNoDelay(true);
    }
    
    res.flushHeaders();
    
    const sendEvent = (data) => {
        const msg = `data: ${JSON.stringify(data)}\n\n`;
        console.log(`[rate-changes] SSE event:`, data.type, data.displayNumber || data.step || '');
        res.write(msg);
        // Force flush if available
        if (res.flush) res.flush();
    };
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        sendEvent({ type: 'error', message: 'Missing database connection string' });
        res.end();
        return;
    }
    
    try {
        // Step 1: Update database
        sendEvent({ type: 'progress', step: 'database', message: 'Updating tracking database...' });
        
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('effective_date', sql.Date, new Date(`${year}-01-01`));
            request.input('client_id', sql.NVarChar, client_id);
            request.input('client_first_name', sql.NVarChar, client_first_name || null);
            request.input('client_last_name', sql.NVarChar, client_last_name || null);
            request.input('client_email', sql.NVarChar, client_email || null);
            request.input('matter_ids', sql.NVarChar, JSON.stringify(matter_ids || []));
            request.input('display_numbers', sql.NVarChar, JSON.stringify(display_numbers || []));
            request.input('sent_by', sql.NVarChar, sent_by || null);
            request.input('sent_date', sql.Date, parsedSentDate);
            
            await request.query(`
                MERGE rate_change_notifications AS target
                USING (SELECT @year AS rate_change_year, @client_id AS client_id) AS source
                ON target.rate_change_year = source.rate_change_year AND target.client_id = source.client_id
                WHEN MATCHED THEN
                    UPDATE SET 
                        status = 'sent',
                        sent_date = @sent_date,
                        sent_by = @sent_by,
                        client_first_name = COALESCE(@client_first_name, client_first_name),
                        client_last_name = COALESCE(@client_last_name, client_last_name),
                        client_email = COALESCE(@client_email, client_email),
                        matter_ids = @matter_ids,
                        display_numbers = @display_numbers,
                        na_reason = NULL,
                        na_notes = NULL,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (rate_change_year, effective_date, client_id, client_first_name, client_last_name, 
                            client_email, matter_ids, display_numbers, status, sent_date, sent_by)
                    VALUES (@year, @effective_date, @client_id, @client_first_name, @client_last_name,
                            @client_email, @matter_ids, @display_numbers, 'sent', @sent_date, @sent_by);
            `);
        });
        
        sendEvent({ type: 'progress', step: 'database', status: 'complete', message: 'Database updated' });
        
        // Step 2: Update Clio matters with streaming feedback
        const matters = matter_ids || [];
        const displayNums = display_numbers || [];
        const clioDate = parsedSentDate.toISOString().split('T')[0];
        const fieldId = parseInt(RATE_CHANGE_DATE_FIELD_ID);
        
        if (matters.length === 0) {
            sendEvent({ type: 'complete', success: true, status: 'sent', clio_updates: { success: 0, failed: 0, skipped: 0 } });
            res.end();
            return;
        }
        
        sendEvent({ type: 'progress', step: 'clio', message: `Updating ${matters.length} matters in Clio...`, total: matters.length });
        
        let accessToken;
        try {
            accessToken = await getClioAccessToken();
        } catch (authErr) {
            sendEvent({ type: 'error', message: `Clio auth failed: ${authErr.message}` });
            sendEvent({ type: 'complete', success: true, status: 'sent', clio_updates: { success: 0, failed: matters.length, errors: [authErr.message] } });
            res.end();
            return;
        }
        
        let success = 0, failed = 0, skipped = 0;
        const errors = [];
        
        for (let i = 0; i < matters.length; i++) {
            const matterId = matters[i];
            const displayNumber = displayNums[i] || matterId;
            
            sendEvent({ 
                type: 'matter-start', 
                index: i, 
                matterId, 
                displayNumber, 
                total: matters.length 
            });
            
            const result = await updateSingleMatterRateChangeDate(matterId, displayNumber, clioDate, accessToken, fieldId);
            
            if (result.success) {
                if (result.skipped) {
                    skipped++;
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId, 
                        displayNumber, 
                        success: true,
                        skipped: true,
                        message: 'Not found in Clio (may be closed)',
                        progress: { success, failed, skipped, total: matters.length }
                    });
                } else {
                    success++;
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId, 
                        displayNumber, 
                        success: true,
                        progress: { success, failed, skipped, total: matters.length }
                    });
                }
            } else {
                failed++;
                errors.push(`${displayNumber}: ${result.error}`);
                sendEvent({ 
                    type: 'matter-complete', 
                    index: i, 
                    matterId, 
                    displayNumber, 
                    success: false, 
                    error: result.error,
                    progress: { success, failed, skipped, total: matters.length }
                });
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        sendEvent({ 
            type: 'complete', 
            success: true, 
            status: 'sent',
            clio_updates: { success, failed, skipped, errors }
        });
        
    } catch (error) {
        console.error('[rate-changes] Error in mark-sent-stream:', error);
        sendEvent({ type: 'error', message: error.message });
    }
    
    res.end();
});

/**
 * POST /api/rate-changes/:year/mark-na-stream
 * Mark as N/A with SSE streaming for real-time Clio updates
 */
router.post('/:year/mark-na-stream', async (req, res) => {
    const { year } = req.params;
    const { 
        client_id, 
        client_first_name, 
        client_last_name, 
        client_email,
        matter_ids,
        display_numbers,
        na_reason,
        na_notes,
        marked_by
    } = req.body;
    
    console.log(`[rate-changes] mark-na-stream: client_id="${client_id}", reason="${na_reason}", matters=${(matter_ids || []).length}`);
    
    if (!client_id || !na_reason) {
        return res.status(400).json({ error: 'client_id and na_reason required' });
    }
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Disable any response buffering
    if (res.socket) {
        res.socket.setNoDelay(true);
    }
    
    res.flushHeaders();
    
    const sendEvent = (data) => {
        const msg = `data: ${JSON.stringify(data)}\n\n`;
        console.log(`[rate-changes] SSE event:`, data.type, data.displayNumber || data.step || '');
        res.write(msg);
        // Force flush if available
        if (res.flush) res.flush();
    };
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        sendEvent({ type: 'error', message: 'Missing database connection string' });
        res.end();
        return;
    }
    
    try {
        // Step 1: Update database
        sendEvent({ type: 'progress', step: 'database', message: 'Updating tracking database...' });
        
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('effective_date', sql.Date, new Date(`${year}-01-01`));
            request.input('client_id', sql.NVarChar, client_id);
            request.input('client_first_name', sql.NVarChar, client_first_name || null);
            request.input('client_last_name', sql.NVarChar, client_last_name || null);
            request.input('client_email', sql.NVarChar, client_email || null);
            request.input('matter_ids', sql.NVarChar, JSON.stringify(matter_ids || []));
            request.input('display_numbers', sql.NVarChar, JSON.stringify(display_numbers || []));
            request.input('na_reason', sql.NVarChar, na_reason);
            request.input('na_notes', sql.NVarChar, na_notes || null);
            request.input('marked_by', sql.NVarChar, marked_by || null);
            
            await request.query(`
                MERGE rate_change_notifications AS target
                USING (SELECT @year AS rate_change_year, @client_id AS client_id) AS source
                ON target.rate_change_year = source.rate_change_year AND target.client_id = source.client_id
                WHEN MATCHED THEN
                    UPDATE SET 
                        status = 'not_applicable',
                        na_reason = @na_reason,
                        na_notes = @na_notes,
                        sent_by = @marked_by,
                        client_first_name = COALESCE(@client_first_name, client_first_name),
                        client_last_name = COALESCE(@client_last_name, client_last_name),
                        client_email = COALESCE(@client_email, client_email),
                        matter_ids = @matter_ids,
                        display_numbers = @display_numbers,
                        sent_date = NULL,
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (rate_change_year, effective_date, client_id, client_first_name, client_last_name,
                            client_email, matter_ids, display_numbers, status, na_reason, na_notes, sent_by)
                    VALUES (@year, @effective_date, @client_id, @client_first_name, @client_last_name,
                            @client_email, @matter_ids, @display_numbers, 'not_applicable', @na_reason, @na_notes, @marked_by);
            `);
        });
        
        sendEvent({ type: 'progress', step: 'database', status: 'complete', message: 'Database updated' });
        
        // Step 2: Update Clio matters with streaming feedback
        const matters = matter_ids || [];
        const displayNums = display_numbers || [];
        const fieldId = parseInt(RATE_CHANGE_DATE_FIELD_ID);
        
        if (matters.length === 0) {
            sendEvent({ type: 'complete', success: true, status: 'not_applicable', clio_updates: { success: 0, failed: 0, skipped: 0 } });
            res.end();
            return;
        }
        
        sendEvent({ type: 'progress', step: 'clio', message: `Updating ${matters.length} matters in Clio...`, total: matters.length });
        
        let accessToken;
        try {
            accessToken = await getClioAccessToken();
        } catch (authErr) {
            sendEvent({ type: 'error', message: `Clio auth failed: ${authErr.message}` });
            sendEvent({ type: 'complete', success: true, status: 'not_applicable', clio_updates: { success: 0, failed: matters.length, errors: [authErr.message] } });
            res.end();
            return;
        }
        
        let success = 0, failed = 0, skipped = 0;
        const errors = [];
        
        for (let i = 0; i < matters.length; i++) {
            const matterId = matters[i];
            const displayNumber = displayNums[i] || matterId;
            
            sendEvent({ 
                type: 'matter-start', 
                index: i, 
                matterId, 
                displayNumber, 
                total: matters.length 
            });
            
            const result = await updateSingleMatterRateChangeDate(matterId, displayNumber, NA_DATE, accessToken, fieldId);
            
            if (result.success) {
                if (result.skipped) {
                    skipped++;
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId, 
                        displayNumber, 
                        success: true,
                        skipped: true,
                        message: 'Not found in Clio (may be closed)',
                        progress: { success, failed, skipped, total: matters.length }
                    });
                } else {
                    success++;
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId, 
                        displayNumber, 
                        success: true,
                        progress: { success, failed, skipped, total: matters.length }
                    });
                }
            } else {
                failed++;
                errors.push(`${displayNumber}: ${result.error}`);
                sendEvent({ 
                    type: 'matter-complete', 
                    index: i, 
                    matterId, 
                    displayNumber, 
                    success: false, 
                    error: result.error,
                    progress: { success, failed, skipped, total: matters.length }
                });
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        sendEvent({ 
            type: 'complete', 
            success: true, 
            status: 'not_applicable',
            clio_updates: { success, failed, skipped, errors }
        });
        
    } catch (error) {
        console.error('[rate-changes] Error in mark-na-stream:', error);
        sendEvent({ type: 'error', message: error.message });
    }
    
    res.end();
});

/**
 * Helper: Clear a single matter's rate change date in Clio (set to null)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function clearSingleMatterRateChangeDate(matterId, displayNumber, accessToken, fieldId) {
    const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
    
    try {
        // First, fetch existing custom field values to get the value ID
        const matterUrl = `${clioBase}/matters/${matterId}.json?fields=custom_field_values{id,custom_field}`;
        const matterResp = await fetch(matterUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        let existingValueId = null;
        if (matterResp.ok) {
            const matterData = await matterResp.json();
            const existingValues = matterData.data?.custom_field_values || [];
            const existingField = existingValues.find(v => v.custom_field?.id === fieldId);
            if (existingField) {
                existingValueId = existingField.id;
            }
        }
        
        // If no existing value, nothing to clear
        if (!existingValueId) {
            console.log(`[rate-changes] No existing field value for matter ${displayNumber}, skipping clear`);
            return { success: true };
        }
        
        // To clear, we need to use _destroy flag or set value to null
        const updateUrl = `${clioBase}/matters/${matterId}.json`;
        const updateResp = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    custom_field_values: [{
                        id: existingValueId,
                        custom_field: { id: fieldId },
                        _destroy: true
                    }]
                }
            })
        });
        
        if (updateResp.ok) {
            console.log(`[rate-changes] ✓ Cleared matter ${displayNumber} (${matterId})`);
            return { success: true };
        } else if (updateResp.status === 404) {
            // Matter not found in Clio - treat as success (test matter or not synced to Clio)
            console.log(`[rate-changes] ⊘ Matter ${displayNumber} not in Clio (404) - skipping clear`);
            return { success: true, skipped: true };
        } else {
            const errorText = await updateResp.text();
            console.error(`[rate-changes] ✗ Failed to clear matter ${displayNumber}: ${updateResp.status} - ${errorText.substring(0, 200)}`);
            return { success: false, error: `${updateResp.status}: ${errorText.substring(0, 100)}` };
        }
    } catch (err) {
        console.error(`[rate-changes] ✗ Error clearing matter ${displayNumber}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * POST /api/rate-changes/:year/undo-stream
 * Remove tracking record (revert to pending) and clear Clio custom field with SSE streaming
 */
router.post('/:year/undo-stream', async (req, res) => {
    const { year } = req.params;
    const { client_id, matters } = req.body; // matters = [{ matter_id, display_number }, ...]
    
    if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const sendEvent = (data) => {
        console.log('[rate-changes] SSE undo event:', data.type, data.displayNumber || '');
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        sendEvent({ type: 'error', message: 'Missing database connection' });
        return res.end();
    }
    
    // Clear Clio custom fields if matters provided
    let clioResults = { succeeded: 0, failed: 0, errors: [] };
    if (matters && matters.length > 0) {
        try {
            sendEvent({ type: 'progress', step: 'auth', status: 'Authenticating with Clio...' });
            const accessToken = await getClioAccessToken();
            const fieldId = parseInt(RATE_CHANGE_DATE_FIELD_ID);
            
            sendEvent({ type: 'progress', step: 'clearing', status: `Clearing ${matters.length} matter(s)...`, total: matters.length });
            
            for (let i = 0; i < matters.length; i++) {
                const m = matters[i];
                sendEvent({ 
                    type: 'matter-start', 
                    index: i, 
                    matterId: m.matter_id, 
                    displayNumber: m.display_number 
                });
                
                const result = await clearSingleMatterRateChangeDate(
                    m.matter_id, 
                    m.display_number, 
                    accessToken, 
                    fieldId
                );
                
                if (result.success) {
                    clioResults.succeeded++;
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId: m.matter_id, 
                        displayNumber: m.display_number,
                        success: true 
                    });
                } else {
                    clioResults.failed++;
                    clioResults.errors.push({ display_number: m.display_number, error: result.error });
                    sendEvent({ 
                        type: 'matter-complete', 
                        index: i, 
                        matterId: m.matter_id, 
                        displayNumber: m.display_number,
                        success: false,
                        error: result.error 
                    });
                }
            }
            console.log(`[rate-changes] Clio clear results: ${clioResults.succeeded} succeeded, ${clioResults.failed} failed`);
        } catch (clioErr) {
            console.error('[rate-changes] Clio clear error:', clioErr.message);
            sendEvent({ type: 'error', message: `Clio error: ${clioErr.message}` });
            // Continue with DB deletion even if Clio fails
        }
    }
    
    // Delete the tracking record
    try {
        sendEvent({ type: 'progress', step: 'database', status: 'Removing tracking record...' });
        
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('client_id', sql.NVarChar, client_id);
            
            await request.query(`
                DELETE FROM rate_change_notifications
                WHERE rate_change_year = @year AND client_id = @client_id
            `);
        });
        
        sendEvent({ 
            type: 'complete', 
            success: true,
            clio_updates: {
                success: clioResults.succeeded,
                failed: clioResults.failed,
                errors: clioResults.errors
            }
        });
        
    } catch (error) {
        console.error('[rate-changes] Error undoing:', error);
        sendEvent({ type: 'error', message: error.message });
    }
    
    res.end();
});

/**
 * POST /api/rate-changes/:year/undo
 * Remove tracking record (revert to pending) and clear Clio custom field
 */
router.post('/:year/undo', async (req, res) => {
    const { year } = req.params;
    const { client_id, matters } = req.body; // matters = [{ matter_id, display_number }, ...]
    
    if (!client_id) {
        return res.status(400).json({ error: 'client_id required' });
    }
    
    const instructionsConn = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!instructionsConn) {
        return res.status(500).json({ error: 'Missing instructions database connection string' });
    }
    
    // Clear Clio custom fields if matters provided
    let clioResults = { succeeded: 0, failed: 0, errors: [] };
    if (matters && matters.length > 0) {
        try {
            const accessToken = await getClioAccessToken();
            const fieldId = parseInt(RATE_CHANGE_DATE_FIELD_ID);
            
            for (const m of matters) {
                const result = await clearSingleMatterRateChangeDate(
                    m.matter_id, 
                    m.display_number, 
                    accessToken, 
                    fieldId
                );
                if (result.success) {
                    clioResults.succeeded++;
                } else {
                    clioResults.failed++;
                    clioResults.errors.push({ display_number: m.display_number, error: result.error });
                }
            }
            console.log(`[rate-changes] Clio clear results: ${clioResults.succeeded} succeeded, ${clioResults.failed} failed`);
        } catch (clioErr) {
            console.error('[rate-changes] Clio clear error:', clioErr.message);
            // Continue with DB deletion even if Clio fails
        }
    }
    
    try {
        await withRequest(instructionsConn, async (request) => {
            request.input('year', sql.Int, parseInt(year));
            request.input('client_id', sql.NVarChar, client_id);
            
            await request.query(`
                DELETE FROM rate_change_notifications
                WHERE rate_change_year = @year AND client_id = @client_id
            `);
        });
        
        res.json({ 
            success: true, 
            status: 'pending',
            clioCleared: clioResults
        });
        
    } catch (error) {
        console.error('[rate-changes] Error undoing:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/rate-changes/:year/export
 * Export as CSV
 */
router.get('/:year/export', async (req, res) => {
    // TODO: Implement CSV export
    res.status(501).json({ error: 'Export not yet implemented' });
});

module.exports = router;
