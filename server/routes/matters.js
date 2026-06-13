const express = require('express');
const sql = require('mssql');
const { withRequest, getPool } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const {
  attachMattersStream,
} = require('../utils/matters-stream');

const router = express.Router();

// Register the stream before generic parameter routes so /stream is not
// swallowed by /:id.
attachMattersStream(router);

const getInstrConnStr = () => {
  const s = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!s) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return s;
};

const normaliseInstructionRef = (value) => String(value || '').trim().toUpperCase();

const parseProspectIdFromInstructionRef = (instructionRef) => {
    const match = String(instructionRef || '').trim().match(/^(?:[A-Z]+-?)?(\d+)-\d+/i);
    return match?.[1] || null;
};

const buildSqlInParams = (request, values, prefix, type = sql.NVarChar(100)) => {
    const placeholders = [];
    values.forEach((value, index) => {
        const key = `${prefix}${index}`;
        request.input(key, type, value);
        placeholders.push(`@${key}`);
    });
    return placeholders;
};

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

const pickContactEmail = (contact) => {
    const primary = String(contact?.primary_email_address || '').trim();
    if (primary) return primary;

    const emails = Array.isArray(contact?.email_addresses) ? contact.email_addresses : [];
    const fallback = emails
        .map((entry) => String(entry?.address || '').trim())
        .find(Boolean);
    return fallback || '';
};

async function fetchClioClientEmail(clientId, initials) {
    if (!clientId) {
        throw new Error('ClientID is required for Clio email lookup');
    }

    const accessToken = await getClioAccessToken(initials || undefined);
    const fields = 'id,primary_email_address,email_addresses';
    const response = await fetch(`${CLIO_API_BASE}/contacts/${encodeURIComponent(String(clientId))}?fields=${fields}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Clio client lookup failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return pickContactEmail(payload?.data || null);
}

/**
 * Get matter details from our database by instruction reference
 */
router.get('/details/:instructionRef', async (req, res) => {
    try {
        const { instructionRef } = req.params;
        
        // Initialize database connection
        const pool = await getPool(getInstrConnStr());
        
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

    // Demo matter — return synthetic data instead of hitting Clio
    if (id === 'DEMO-3311402' || id === '3311402') {
        return res.json({
            ok: true,
            matterId: '3311402',
            display_number: 'HELIX01-01',
            displayNumber: 'HELIX01-01',
            number: 'HELIX01-01',
            data: {
                id: 3311402,
                display_number: 'HELIX01-01',
                number: 'HELIX01-01',
                description: 'Admin',
                status: 'Open',
                open_date: new Date().toISOString().split('T')[0],
                client: { id: 5257922, name: 'Helix administration' },
                responsible_attorney: { name: 'Luke Watson' },
                originating_attorney: { name: 'Luke Watson' },
                supervising_attorney: { name: 'Luke Watson' },
                practice_area: { name: 'Commercial' },
            },
        });
    }

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
                const db = await getPool(getInstrConnStr());
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
            const result = await withRequest(legacyConnStr, async (request) => {
                return request
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
            });
            const rows = result.recordset || [];
                results.legacy = {
                    found: rows.length > 0,
                    count: rows.length,
                    matches: rows.map(r => ({
                        id: r.id,
                        aow: r.aow,
                        tow: r.tow,
                        date: r.datetime,
                        stage: r.stage,
                        source: r.source,
                        campaign: r.campaign,
                        adSet: r.adSet,
                        keyword: r.keyword,
                        url: r.url,
                        gclid: r.gclid,
                    })),
                    error: null
                };
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
            const result = await withRequest(instructionsConnStr, async (request) => {
                return request
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
            });
            const rows = result.recordset || [];
                results.instructions = {
                    found: rows.length > 0,
                    count: rows.length,
                    matches: rows.map(r => ({
                        id: r.id,
                        aow: r.aow,
                        tow: r.tow,
                        date: r.datetime,
                        stage: r.stage,
                        source: r.source,
                        campaign: r.campaign,
                        adSet: r.adSet,
                        keyword: r.keyword,
                        url: r.url,
                        gclid: r.gclid,
                    })),
                    error: null
                };

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

/**
 * POST /api/matters/enquiry-linkage
 * Resolve matter InstructionRef -> ProspectId -> linked enquiry source context.
 * Returns structural fields only (no client PII content).
 */
router.post('/enquiry-linkage', async (req, res) => {
    const startedAt = Date.now();
    const rawRefs = Array.isArray(req.body?.instructionRefs) ? req.body.instructionRefs : [];
    const instructionRefs = Array.from(new Set(
        rawRefs
            .map(normaliseInstructionRef)
            .filter(Boolean)
            .slice(0, 350)
    ));

    trackEvent('Matters.EnquiryLinkage.Started', {
        operation: 'matters-enquiry-linkage',
        requestedRefs: String(instructionRefs.length),
        triggeredBy: 'api',
    });

    if (instructionRefs.length === 0) {
        return res.json({ ok: true, links: [], count: 0 });
    }

    const prospectsByInstructionRef = new Map();
    instructionRefs.forEach((instructionRef) => {
        const parsed = parseProspectIdFromInstructionRef(instructionRef);
        if (parsed) prospectsByInstructionRef.set(instructionRef, parsed);
    });

    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    const legacyConnStr = process.env.SQL_CONNECTION_STRING;

    try {
        if (instructionsConnStr) {
            const dealRows = await withRequest(instructionsConnStr, async (request) => {
                const placeholders = buildSqlInParams(request, instructionRefs, 'instructionRef');
                return request.query(`
                    WITH RankedDeals AS (
                        SELECT
                            UPPER(LTRIM(RTRIM(InstructionRef))) AS InstructionRef,
                            CAST(ProspectId AS NVARCHAR(100)) AS ProspectId,
                            ROW_NUMBER() OVER (PARTITION BY UPPER(LTRIM(RTRIM(InstructionRef))) ORDER BY DealId DESC) AS rn
                        FROM dbo.Deals WITH (NOLOCK)
                        WHERE UPPER(LTRIM(RTRIM(InstructionRef))) IN (${placeholders.join(',')})
                    )
                    SELECT InstructionRef, ProspectId
                    FROM RankedDeals
                    WHERE rn = 1
                `);
            });

            (dealRows.recordset || []).forEach((row) => {
                const instructionRef = normaliseInstructionRef(row.InstructionRef);
                const prospectId = String(row.ProspectId || '').trim();
                if (instructionRef && prospectId) prospectsByInstructionRef.set(instructionRef, prospectId);
            });
        }

        const prospectIds = Array.from(new Set(Array.from(prospectsByInstructionRef.values()).filter(Boolean)));
        const byProspect = new Map();

        if (prospectIds.length > 0 && instructionsConnStr) {
            const instructionsRows = await withRequest(instructionsConnStr, async (request) => {
                const placeholders = buildSqlInParams(request, prospectIds, 'prospectIdInst');
                return request.query(`
                    IF COL_LENGTH('dbo.enquiries', 'Touchpoint_Date') IS NOT NULL
                    BEGIN
                        WITH Ranked AS (
                            SELECT
                                CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100)) AS ProspectId,
                                CAST(id AS NVARCHAR(100)) AS EnquiryId,
                                NULLIF(LTRIM(RTRIM(source)), '') AS Source,
                                ROW_NUMBER() OVER (
                                    PARTITION BY CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100))
                                    ORDER BY COALESCE(Touchpoint_Date, datetime) DESC
                                ) AS rn
                            FROM dbo.enquiries WITH (NOLOCK)
                            WHERE CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100)) IN (${placeholders.join(',')})
                        )
                        SELECT ProspectId, EnquiryId, Source
                        FROM Ranked
                        WHERE rn = 1;
                    END
                    ELSE
                    BEGIN
                        WITH Ranked AS (
                            SELECT
                                CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100)) AS ProspectId,
                                CAST(id AS NVARCHAR(100)) AS EnquiryId,
                                NULLIF(LTRIM(RTRIM(source)), '') AS Source,
                                ROW_NUMBER() OVER (
                                    PARTITION BY CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100))
                                    ORDER BY datetime DESC
                                ) AS rn
                            FROM dbo.enquiries WITH (NOLOCK)
                            WHERE CAST(COALESCE(NULLIF(LTRIM(RTRIM(acid)), ''), LTRIM(RTRIM(id))) AS NVARCHAR(100)) IN (${placeholders.join(',')})
                        )
                        SELECT ProspectId, EnquiryId, Source
                        FROM Ranked
                        WHERE rn = 1;
                    END
                `);
            });

            (instructionsRows.recordset || []).forEach((row) => {
                const prospectId = String(row.ProspectId || '').trim();
                if (!prospectId) return;
                byProspect.set(prospectId, {
                    enquiryId: String(row.EnquiryId || '').trim() || null,
                    enquirySource: String(row.Source || '').trim() || null,
                    sourceOrigin: 'instructions',
                });
            });
        }

        if (prospectIds.length > 0 && legacyConnStr) {
            const missingProspects = prospectIds.filter((prospectId) => !byProspect.has(prospectId));
            if (missingProspects.length > 0) {
                const legacyRows = await withRequest(legacyConnStr, async (request) => {
                    const placeholders = buildSqlInParams(request, missingProspects, 'prospectIdLegacy');
                    return request.query(`
                        WITH Ranked AS (
                            SELECT
                                CAST(ID AS NVARCHAR(100)) AS ProspectId,
                                CAST(ID AS NVARCHAR(100)) AS EnquiryId,
                                NULLIF(LTRIM(RTRIM(Ultimate_Source)), '') AS Source,
                                ROW_NUMBER() OVER (PARTITION BY CAST(ID AS NVARCHAR(100)) ORDER BY datetime DESC, CAST(ID AS NVARCHAR(100)) DESC) AS rn
                            FROM dbo.enquiries WITH (NOLOCK)
                            WHERE CAST(ID AS NVARCHAR(100)) IN (${placeholders.join(',')})
                        )
                        SELECT ProspectId, EnquiryId, Source
                        FROM Ranked
                        WHERE rn = 1
                    `);
                });

                (legacyRows.recordset || []).forEach((row) => {
                    const prospectId = String(row.ProspectId || '').trim();
                    if (!prospectId || byProspect.has(prospectId)) return;
                    byProspect.set(prospectId, {
                        enquiryId: String(row.EnquiryId || '').trim() || null,
                        enquirySource: String(row.Source || '').trim() || null,
                        sourceOrigin: 'legacy',
                    });
                });
            }
        }

        const links = instructionRefs.map((instructionRef) => {
            const prospectId = prospectsByInstructionRef.get(instructionRef) || null;
            const linked = prospectId ? byProspect.get(prospectId) : null;
            const enquirySource = linked?.enquirySource || null;

            return {
                instructionRef,
                prospectId,
                linkedEnquiryId: linked?.enquiryId || null,
                enquirySource,
                sourceOrigin: linked?.sourceOrigin || null,
                linkStatus: linked ? 'linked' : 'unlinked',
                sourceCheckStatus: !linked ? 'unlinked' : enquirySource ? 'completed' : 'pending',
            };
        });

        const durationMs = Date.now() - startedAt;
        const linkedCount = links.filter((item) => item.linkStatus === 'linked').length;
        trackEvent('Matters.EnquiryLinkage.Completed', {
            operation: 'matters-enquiry-linkage',
            triggeredBy: 'api',
            requestedRefs: String(instructionRefs.length),
            linkedCount: String(linkedCount),
            durationMs: String(durationMs),
        });
        trackMetric('Matters.EnquiryLinkage.Duration', durationMs, { operation: 'matters-enquiry-linkage' });

        return res.json({
            ok: true,
            links,
            count: links.length,
            linkedCount,
        });
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error, {
            operation: 'matters-enquiry-linkage',
            phase: 'resolve-linkage',
        });
        trackEvent('Matters.EnquiryLinkage.Failed', {
            operation: 'matters-enquiry-linkage',
            triggeredBy: 'api',
            requestedRefs: String(instructionRefs.length),
            durationMs: String(durationMs),
            error: error?.message || 'Unknown error',
        });
        console.error('Matters enquiry linkage failed:', error?.message || error);
        return res.status(500).json({ error: 'Failed to resolve matters enquiry linkage' });
    }
});

/**
 * POST /api/matters/client-name/resolve
 * User-invoked client-name resolver for Data Hub.
 * Queries the Instructions table by MatterID and writes the resolved name
 * back to dbo.Matters.ClientName.
 */
router.post('/client-name/resolve', async (req, res) => {
    const startedAt = Date.now();
    const uniqueId = String(req.body?.uniqueId || '').trim();
    const matterRef = String(req.body?.matterRef || '').trim();
    const system = String(req.body?.system || '').trim().toLowerCase();

    trackEvent('Matters.ClientNameResolve.Started', {
        operation: 'matters-client-name-resolve',
        triggeredBy: 'api',
        hasUniqueId: String(Boolean(uniqueId)),
        system: system || 'unknown',
    });

    if (system && system !== 'new-space') {
        return res.status(400).json({ error: 'Only new-space matters are supported.' });
    }
    if (!uniqueId) {
        return res.status(400).json({ error: 'UniqueID is required.' });
    }

    try {
        const instructionsConnStr = getInstrConnStr();

        const instrRow = await withRequest(instructionsConnStr, async (request) => {
            request.input('matterId', sql.NVarChar(255), uniqueId);
            const result = await request.query(`
                SELECT TOP 1 FirstName, LastName, CompanyName, ClientType
                FROM dbo.Instructions WITH (NOLOCK)
                WHERE MatterId = @matterId
                ORDER BY LastUpdated DESC, SubmissionDate DESC
            `);
            return result.recordset?.[0] || null;
        });

        if (!instrRow) {
            return res.status(404).json({ error: 'No linked instruction record found for this matter.' });
        }

        const companyName = String(instrRow.CompanyName || '').trim();
        const firstName = String(instrRow.FirstName || '').trim();
        const lastName = String(instrRow.LastName || '').trim();
        const clientType = String(instrRow.ClientType || '').trim().toLowerCase();

        let resolvedName = '';
        if (clientType === 'company' && companyName) {
            resolvedName = companyName;
        } else if (firstName || lastName) {
            resolvedName = `${firstName} ${lastName}`.trim();
        } else if (companyName) {
            resolvedName = companyName;
        }

        if (!resolvedName) {
            return res.status(404).json({ error: 'Instruction record found but has no name fields.' });
        }

        const writeResult = await withRequest(instructionsConnStr, async (request) => {
            request.input('uniqueId', sql.NVarChar(255), uniqueId);
            request.input('clientName', sql.NVarChar(255), resolvedName);
            return request.query(`
                DECLARE @whereColumn NVARCHAR(128) = NULL;
                DECLARE @sql NVARCHAR(MAX);

                IF COL_LENGTH('dbo.Matters', 'MatterID') IS NOT NULL
                    SET @whereColumn = N'[MatterID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'UniqueID') IS NOT NULL
                    SET @whereColumn = N'[UniqueID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'Unique ID') IS NOT NULL
                    SET @whereColumn = N'[Unique ID]';

                IF @whereColumn IS NULL
                    THROW 50000, 'Matters table is missing supported identifier columns.', 1;

                SET @sql = N'
                    UPDATE dbo.Matters
                    SET ClientName = @clientName
                    WHERE CONVERT(NVARCHAR(255), ' + @whereColumn + N') = @uniqueId;
                ';

                EXEC sp_executesql
                    @sql,
                    N'@clientName NVARCHAR(255), @uniqueId NVARCHAR(255)',
                    @clientName = @clientName,
                    @uniqueId = @uniqueId;
            `);
        });

        const rowsUpdated = Number(writeResult?.rowsAffected?.reduce((sum, count) => sum + Number(count || 0), 0) || 0);
        if (rowsUpdated === 0) {
            return res.status(404).json({ error: 'Matter not found for supplied uniqueId.' });
        }

        const durationMs = Date.now() - startedAt;
        trackEvent('Matters.ClientNameResolve.Completed', {
            operation: 'matters-client-name-resolve',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            rowsUpdated: String(rowsUpdated),
            system: system || 'new-space',
        });
        trackMetric('Matters.ClientNameResolve.Duration', durationMs, { operation: 'matters-client-name-resolve' });

        return res.json({ ok: true, uniqueId, matterRef, clientName: resolvedName });
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error, { operation: 'matters-client-name-resolve', phase: 'resolve-and-write' });
        trackEvent('Matters.ClientNameResolve.Failed', {
            operation: 'matters-client-name-resolve',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            error: error?.message || 'Unknown error',
        });
        console.error('Matters client-name resolve failed:', error?.message || error);
        return res.status(500).json({ error: 'Failed to resolve client name.' });
    }
});

/**
 * POST /api/matters/enquiry-linkage/write
 * User-invoked linkage helper for Data Hub.
 * Resolves ClientID -> Clio email -> new-space enquiry, then stores
 * EnquiryID and MatterRef on dbo.Matters for the selected matter row.
 */
router.post('/enquiry-linkage/write', async (req, res) => {
    const startedAt = Date.now();
    const uniqueId = String(req.body?.uniqueId || '').trim();
    const clientId = String(req.body?.clientId || '').trim();
    const matterRef = String(req.body?.matterRef || '').trim();
    const system = String(req.body?.system || '').trim().toLowerCase();
    const userInitials = String(req.user?.initials || req.headers?.['x-helix-initials'] || '').trim().toLowerCase();

    trackEvent('Matters.EnquiryLinkageWrite.Started', {
        operation: 'matters-enquiry-linkage-write',
        triggeredBy: 'api',
        hasUniqueId: String(Boolean(uniqueId)),
        hasClientId: String(Boolean(clientId)),
        hasMatterRef: String(Boolean(matterRef)),
        system: system || 'unknown',
    });

    if (system && system !== 'new-space') {
        return res.status(400).json({ error: 'Only new-space matters can be updated from this workspace.' });
    }
    if (!uniqueId) {
        return res.status(400).json({ error: 'UniqueID is required.' });
    }
    if (!matterRef) {
        return res.status(400).json({ error: 'Matter reference is required.' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'ClientID is required for linkage.' });
    }

    try {
        const instructionsConnStr = getInstrConnStr();
        const clientEmail = await fetchClioClientEmail(clientId, userInitials || undefined);
        const normalised = normaliseEmail(clientEmail);

        if (!normalised) {
            return res.status(404).json({ error: 'No client email found in Clio for this matter.' });
        }

        const linkedEnquiry = await withRequest(instructionsConnStr, async (request) => {
            request.input('email', sql.NVarChar(255), normalised);
            const result = await request.query(`
                WITH Ranked AS (
                    SELECT
                        CAST(id AS NVARCHAR(100)) AS EnquiryID,
                        NULLIF(LTRIM(RTRIM(source)), '') AS EnquirySource,
                        ROW_NUMBER() OVER (
                            ORDER BY datetime DESC, CAST(ID AS NVARCHAR(100)) DESC
                        ) AS rn
                    FROM dbo.enquiries WITH (NOLOCK)
                    WHERE LOWER(LTRIM(RTRIM(Email))) = @email
                )
                SELECT TOP 1 EnquiryID, EnquirySource
                FROM Ranked
                WHERE rn = 1
            `);
            return result.recordset?.[0] || null;
        });

        const enquiryId = String(linkedEnquiry?.EnquiryID || '').trim() || null;
        const enquirySource = String(linkedEnquiry?.EnquirySource || '').trim() || null;

        const writeResult = await withRequest(instructionsConnStr, async (request) => {
            request.input('uniqueId', sql.NVarChar(255), uniqueId);
            request.input('enquiryId', sql.NVarChar(100), enquiryId);
            return request.query(`
                DECLARE @whereColumn NVARCHAR(128) = NULL;
                DECLARE @sql NVARCHAR(MAX);

                IF COL_LENGTH('dbo.Matters', 'MatterID') IS NOT NULL
                    SET @whereColumn = N'[MatterID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'UniqueID') IS NOT NULL
                    SET @whereColumn = N'[UniqueID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'Unique ID') IS NOT NULL
                    SET @whereColumn = N'[Unique ID]';

                IF @whereColumn IS NULL
                    THROW 50000, 'Matters table is missing supported identifier columns.', 1;

                SET @sql = N'
                    UPDATE dbo.Matters
                    SET EnquiryID = @enquiryId
                    WHERE CONVERT(NVARCHAR(255), ' + @whereColumn + N') = @uniqueId;
                ';

                EXEC sp_executesql
                    @sql,
                    N'@enquiryId NVARCHAR(100), @uniqueId NVARCHAR(255)',
                    @enquiryId = @enquiryId,
                    @uniqueId = @uniqueId;
            `);
        });

        const rowsUpdated = Number(writeResult?.rowsAffected?.reduce((sum, count) => sum + Number(count || 0), 0) || 0);
        if (rowsUpdated === 0) {
            return res.status(404).json({ error: 'Matter not found for supplied uniqueId.' });
        }

        const durationMs = Date.now() - startedAt;
        trackEvent('Matters.EnquiryLinkageWrite.Completed', {
            operation: 'matters-enquiry-linkage-write',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            matchedEnquiry: String(Boolean(enquiryId)),
            rowsUpdated: String(rowsUpdated),
            system: system || 'new-space',
        });
        trackMetric('Matters.EnquiryLinkageWrite.Duration', durationMs, { operation: 'matters-enquiry-linkage-write' });

        return res.json({
            ok: true,
            uniqueId,
            matterRef,
            enquiryId,
            enquirySource,
            linkStatus: enquiryId ? 'linked' : 'unlinked',
            sourceCheckStatus: enquiryId ? (enquirySource ? 'completed' : 'pending') : 'unlinked',
        });
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error, {
            operation: 'matters-enquiry-linkage-write',
            phase: 'resolve-and-write',
        });
        trackEvent('Matters.EnquiryLinkageWrite.Failed', {
            operation: 'matters-enquiry-linkage-write',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            error: error?.message || 'Unknown error',
        });
        return res.status(500).json({ error: error?.message || 'Failed to write matters linkage' });
    }
});

router.post('/row-update', async (req, res) => {
    const startedAt = Date.now();
    const uniqueId = String(req.body?.uniqueId || '').trim();
    const updates = req.body?.updates;

    if (!uniqueId) {
        return res.status(400).json({ error: 'UniqueID is required.' });
    }

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ error: 'updates object is required.' });
    }

    const hasSource = Object.prototype.hasOwnProperty.call(updates, 'source');
    const hasMethod = Object.prototype.hasOwnProperty.call(updates, 'method_of_contact');

    if (!hasSource && !hasMethod) {
        return res.status(400).json({ error: 'No supported matter fields to update.' });
    }

    try {
        const instructionsConnStr = getInstrConnStr();
        const setClauses = [];
        if (hasSource) setClauses.push('Source = @sourceValue');
        if (hasMethod) setClauses.push('method_of_contact = @methodValue');

        const result = await withRequest(instructionsConnStr, async (request) => {
            request.input('uniqueId', sql.NVarChar(255), uniqueId);
            request.input('sourceValue', sql.NVarChar(255), hasSource ? String(updates.source ?? '').trim() || null : null);
            request.input('methodValue', sql.NVarChar(255), hasMethod ? String(updates.method_of_contact ?? '').trim() || null : null);

            const dynamicSql = `
                DECLARE @whereColumn NVARCHAR(128) = NULL;
                DECLARE @sql NVARCHAR(MAX);

                IF COL_LENGTH('dbo.Matters', 'MatterID') IS NOT NULL
                    SET @whereColumn = N'[MatterID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'UniqueID') IS NOT NULL
                    SET @whereColumn = N'[UniqueID]';
                ELSE IF COL_LENGTH('dbo.Matters', 'Unique ID') IS NOT NULL
                    SET @whereColumn = N'[Unique ID]';

                IF @whereColumn IS NULL
                    THROW 50000, 'Matters table is missing supported identifier columns.', 1;

                SET @sql = N'
                    UPDATE dbo.Matters
                    SET ${setClauses.join(', ')}
                    WHERE CONVERT(NVARCHAR(255), ' + @whereColumn + N') = @uniqueId;
                ';

                EXEC sp_executesql
                    @sql,
                    N'@uniqueId NVARCHAR(255), @sourceValue NVARCHAR(255), @methodValue NVARCHAR(255)',
                    @uniqueId = @uniqueId,
                    @sourceValue = @sourceValue,
                    @methodValue = @methodValue;
            `;

            return request.query(dynamicSql);
        });

        const rowsUpdated = Number(result?.rowsAffected?.reduce((sum, count) => sum + Number(count || 0), 0) || 0);
        if (rowsUpdated === 0) {
            return res.status(404).json({ error: 'Matter not found for supplied uniqueId.' });
        }

        const durationMs = Date.now() - startedAt;
        trackEvent('Matters.RowUpdate.Completed', {
            operation: 'matters-row-update',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            rowsUpdated: String(rowsUpdated),
            updatedFields: [hasSource ? 'source' : '', hasMethod ? 'method_of_contact' : ''].filter(Boolean).join(','),
        });
        trackMetric('Matters.RowUpdate.Duration', durationMs, { operation: 'matters-row-update' });

        return res.json({ ok: true, uniqueId, rowsUpdated, updatedFields: [hasSource ? 'source' : '', hasMethod ? 'method_of_contact' : ''].filter(Boolean) });
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error, { operation: 'matters-row-update', phase: 'update' });
        trackEvent('Matters.RowUpdate.Failed', {
            operation: 'matters-row-update',
            triggeredBy: 'api',
            durationMs: String(durationMs),
            error: error?.message || 'Unknown error',
        });
        return res.status(500).json({ error: error?.message || 'Failed to update matter row.' });
    }
});

module.exports = router;