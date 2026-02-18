const express = require('express');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const { saveCclContent, markCclUploaded } = require('../utils/cclPersistence');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { resolveRequestActor } = require('../utils/requestActor');
const {
    tokens: cclTokens
} = require(path.join(process.cwd(), 'src', 'app', 'functionality', 'cclSchema.js'));
const EXTRA_TOKENS = [
    'and_or_intervals_eg_every_three_months',
    'charges_estimate_paragraph',
    'client_address',
    'client_email',
    'contact_details_for_marketing_opt_out',
    'costs_other_party_paragraph',
    'disbursements_paragraph',
    'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
    'figure_or_range',
    'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees',
    'handler_hourly_rate',
    'in_total_including_vat_or_for_the_next_steps_in_your_matter',
    'instructions_link',
    'letter_date',
    'may_will',
    'matter_number'
];

let localUsers = [];
try {
    localUsers = require(path.join(process.cwd(), 'src', 'localData', 'localUserData.json'));
} catch {
    localUsers = [];
}

function findUserByName(name) {
    if (!name) return null;
    return (localUsers || []).find(u => {
        const full = u['Full Name'] || `${u.First} ${u.Last}`;
        return full.toLowerCase() === name.toLowerCase();
    }) || null;
}

async function mergeMatterFields(matterId, payload) {
    const port = process.env.PORT || 8080;
    const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
    const base = isNamedPipe && process.env.WEBSITE_HOSTNAME
        ? `https://${process.env.WEBSITE_HOSTNAME}`
        : `http://localhost:${port}`;
    let matterData = {};
    if (matterId) {
        try {
            const resp = await fetch(`${base}/api/matters/${matterId}`);
            if (resp.ok) {
                matterData = await resp.json();
            }
        } catch (err) {
            console.warn('Matter lookup failed', err);
        }
    }

    const flat = { ...payload };
    const firstClient = flat.client_information?.[0] || {};
    if (firstClient.prefix) {
        flat.insert_clients_name = `${firstClient.prefix} ${firstClient.first_name || ''} ${firstClient.last_name || ''}`.trim();
    } else {
        flat.insert_clients_name = firstClient.company_details?.name || '';
    }
    flat.insert_heading_eg_matter_description = flat.matter_details?.description || '';
    flat.matter = flat.matter_details?.matter_ref || flat.matter_details?.instruction_ref || '';
    if (matterData.display_number) flat.matter = matterData.display_number;
    // Letter preamble defaults (auto-filled from matter data)
    if (!flat.matter_number && matterData.display_number) flat.matter_number = matterData.display_number;
    if (!flat.client_email && firstClient.email) flat.client_email = firstClient.email;
    if (!flat.letter_date) {
        const now = new Date();
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        flat.letter_date = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    }
    flat.name_of_person_handling_matter = flat.team_assignments?.fee_earner || '';

    const feeUser = findUserByName(flat.team_assignments?.fee_earner);
    flat.status = feeUser?.Role || '';
    flat.email = feeUser?.Email || '';
    flat.fee_earner_email = feeUser?.Email || '';
    flat.fee_earner_phone = feeUser?.Phone || '';
    flat.fee_earner_postal_address = feeUser?.Address || '';

    // Set hourly rate based on role
    const rateMap = { Partner: '395', 'Senior Partner': '395', 'Senior Associate': '395', Associate: '325', Solicitor: '285', Consultant: '395', 'Trainee Solicitor': '195' };
    if (!flat.handler_hourly_rate) flat.handler_hourly_rate = rateMap[flat.status] || '395';

    const helpers = [
        flat.team_assignments?.fee_earner,
        flat.team_assignments?.originating_solicitor,
        flat.team_assignments?.supervising_partner
    ].filter(Boolean);
    flat.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries = helpers.map(n => {
        const u = findUserByName(n);
        return u ? `${n} <${u.Email}>` : n;
    }).join(', ');

    if (!flat.identify_the_other_party_eg_your_opponents) {
        const opp = flat.opponents?.[0];
        if (opp) flat.identify_the_other_party_eg_your_opponents = opp.name || opp.company || '';
    }

    flat.name_of_handler = flat.name_of_person_handling_matter;
    flat.handler = flat.name_of_person_handling_matter;
    flat.name = flat.insert_clients_name;

    for (const key of cclTokens) {
        if (flat[key] === undefined) flat[key] = '';
    }
    for (const key of EXTRA_TOKENS) {
        if (flat[key] === undefined) flat[key] = '';
    }

    return { ...flat, display_number: matterData.display_number };
}

const router = express.Router();

// CCL outputs live outside public/ to avoid triggering dev server hot reload
const CCL_DIR = path.join(process.cwd(), 'logs', 'ccl-outputs');
fs.mkdirSync(CCL_DIR, { recursive: true });
const CCL_DRAFT_DIR = path.join(process.cwd(), 'logs', 'ccl-drafts');
fs.mkdirSync(CCL_DRAFT_DIR, { recursive: true });

const filePath = (id) => path.join(CCL_DIR, `${id}.docx`);
const jsonPath = (id) => path.join(CCL_DIR, `${id}.json`);
const draftCachePath = (id) => path.join(CCL_DRAFT_DIR, `${id}.json`);

let cclDraftTableAvailable = null;

async function ensureCclDraftsTable(pool) {
    if (cclDraftTableAvailable !== null) return cclDraftTableAvailable;
    const result = await pool.request().query(`
        SELECT CASE WHEN OBJECT_ID(N'CclDrafts', N'U') IS NOT NULL THEN 1 ELSE 0 END AS ExistsFlag
    `);
    cclDraftTableAvailable = Boolean(result?.recordset?.[0]?.ExistsFlag);
    if (!cclDraftTableAvailable) {
        console.warn('[ccl] CclDrafts table not found; using file-based draft fallback only');
    }
    return cclDraftTableAvailable;
}

// Direct SQL functions (no Azure Function proxy)
async function saveDraftToDb(matterId, json) {
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.warn('[ccl] INSTRUCTIONS_SQL_CONNECTION_STRING not configured, skipping DB save');
        return;
    }
    let pool;
    try {
        pool = await sql.connect(connectionString);
        if (!(await ensureCclDraftsTable(pool))) return;
        await pool.request()
            .input('MatterId', sql.NVarChar(50), matterId)
            .input('DraftJson', sql.NVarChar(sql.MAX), JSON.stringify(json))
            .query(`MERGE CclDrafts AS target
                USING (SELECT @MatterId AS MatterId) AS src
                ON target.MatterId = src.MatterId
                WHEN MATCHED THEN UPDATE SET DraftJson = @DraftJson, UpdatedAt = SYSDATETIME()
                WHEN NOT MATCHED THEN INSERT (MatterId, DraftJson, UpdatedAt)
                VALUES (@MatterId, @DraftJson, SYSDATETIME());`);
    } finally {
        if (pool) await pool.close();
    }
}

async function fetchDraftFromDb(matterId) {
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.warn('[ccl] INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
        return null;
    }
    let pool;
    try {
        pool = await sql.connect(connectionString);
        if (!(await ensureCclDraftsTable(pool))) return null;
        const result = await pool.request()
            .input('MatterId', sql.NVarChar(50), matterId)
            .query('SELECT DraftJson FROM CclDrafts WHERE MatterId = @MatterId');
        const row = result.recordset[0];
        return row ? JSON.parse(row.DraftJson) : null;
    } finally {
        if (pool) await pool.close();
    }
}

function saveDraftToFileCache(matterId, json) {
    try {
        fs.writeFileSync(draftCachePath(matterId), JSON.stringify(json, null, 2));
    } catch (err) {
        console.warn('[ccl] Draft file cache save failed:', err?.message || err);
    }
}

function loadDraftFromFileCache(matterId) {
    try {
        const fp = draftCachePath(matterId);
        if (!fs.existsSync(fp)) return null;
        return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
        return null;
    }
}

router.post('/', async (req, res) => {
    const { matterId, draftJson } = req.body || {};
    if (!matterId || typeof draftJson !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    const startMs = Date.now();
    const user = resolveRequestActor(req);
    trackEvent('CCL.Generate.Started', { matterId: String(matterId), user });
    try {
        const merged = await mergeMatterFields(matterId, draftJson);
        try { await saveDraftToDb(matterId, merged); } catch (dbErr) { console.warn('[ccl] Draft DB save failed (non-blocking):', dbErr.message); }

        // Persist full content snapshot (non-blocking)
        saveCclContent({
            matterId,
            instructionRef: merged.matter || null,
            clientName: merged.insert_clients_name || null,
            clientEmail: merged.client_email || null,
            clientAddress: merged.client_address || null,
            matterDescription: merged.insert_heading_eg_matter_description || null,
            feeEarner: merged.name_of_person_handling_matter || null,
            feeEarnerEmail: merged.fee_earner_email || null,
            supervisingPartner: merged.team_assignments?.supervising_partner || null,
            practiceArea: merged.team_assignments?.practice_area || null,
            fieldsJson: merged,
            provenanceJson: draftJson._provenance || null,
            status: 'draft',
            createdBy: user,
        }).catch(err => console.warn('[ccl] CclContent save failed (non-blocking):', err.message));

        await generateWordFromJson(merged, filePath(matterId));
        fs.writeFileSync(jsonPath(matterId), JSON.stringify(merged, null, 2));

        const durationMs = Date.now() - startMs;
        const fieldCount = Object.keys(merged).filter(k => merged[k] && typeof merged[k] === 'string' && merged[k].trim()).length;
        trackEvent('CCL.Generate.Completed', {
            matterId: String(matterId), user, durationMs: String(durationMs),
            fieldCount: String(fieldCount),
            feeEarner: merged.name_of_person_handling_matter || '',
            practiceArea: merged.team_assignments?.practice_area || '',
        });
        trackMetric('CCL.Generate.Duration', durationMs, { matterId: String(matterId) });
        trackMetric('CCL.Generate.FieldCount', fieldCount, { matterId: String(matterId) });

        res.json({ ok: true, url: `/ccls/${matterId}.docx` });
    } catch (err) {
        console.error('CCL generation failed', err);
        trackException(err, { operation: 'CCL.Generate', matterId: String(matterId), user });
        trackEvent('CCL.Generate.Failed', { matterId: String(matterId), user, error: err.message });
        res.status(500).json({ error: 'Failed to generate CCL' });
    }
});

router.patch('/:matterId', async (req, res) => {
    const { draftJson } = req.body || {};
    const { matterId } = req.params;
    if (typeof draftJson !== 'object') {
        return res.status(400).json({ error: 'Invalid draftJson' });
    }
    const startMs = Date.now();
    const user = resolveRequestActor(req);
    trackEvent('CCL.Save.Started', { matterId: String(matterId), user });
    try {
        const merged = await mergeMatterFields(matterId, draftJson);
        try { await saveDraftToDb(matterId, merged); } catch (dbErr) { console.warn('[ccl] Draft DB save failed (non-blocking):', dbErr.message); }
        saveDraftToFileCache(matterId, merged);

        // Persist full content snapshot (non-blocking)
        saveCclContent({
            matterId,
            instructionRef: merged.matter || null,
            clientName: merged.insert_clients_name || null,
            clientEmail: merged.client_email || null,
            clientAddress: merged.client_address || null,
            matterDescription: merged.insert_heading_eg_matter_description || null,
            feeEarner: merged.name_of_person_handling_matter || null,
            feeEarnerEmail: merged.fee_earner_email || null,
            supervisingPartner: merged.team_assignments?.supervising_partner || null,
            practiceArea: merged.team_assignments?.practice_area || null,
            fieldsJson: merged,
            provenanceJson: draftJson._provenance || null,
            status: 'draft',
            createdBy: user,
        }).catch(err => console.warn('[ccl] CclContent save failed (non-blocking):', err.message));

        // Regenerate docx so it stays in sync with the latest fields
        await generateWordFromJson(merged, filePath(matterId));
        fs.writeFileSync(jsonPath(matterId), JSON.stringify(merged, null, 2));

        const durationMs = Date.now() - startMs;
        const fieldCount = Object.keys(merged).filter(k => merged[k] && typeof merged[k] === 'string' && merged[k].trim()).length;
        trackEvent('CCL.Save.Completed', {
            matterId: String(matterId), user, durationMs: String(durationMs),
            fieldCount: String(fieldCount),
            feeEarner: merged.name_of_person_handling_matter || '',
            practiceArea: merged.team_assignments?.practice_area || '',
        });
        trackMetric('CCL.Save.Duration', durationMs, { matterId: String(matterId) });

        res.json({ ok: true, url: `/ccls/${matterId}.docx` });
    } catch (err) {
        console.error('CCL regeneration failed', err);
        trackException(err, { operation: 'CCL.Save', matterId: String(matterId), user });
        trackEvent('CCL.Save.Failed', { matterId: String(matterId), user, error: err.message });
        res.status(500).json({ error: 'Failed to regenerate CCL' });
    }
});

router.get('/:matterId', async (req, res) => {
    const { matterId } = req.params;
    const fp = filePath(matterId);
    const exists = fs.existsSync(fp);
    let json;
    let source = 'none';
    try {
        json = await fetchDraftFromDb(matterId);
        if (json) source = 'db';
        if (!json) {
            json = loadDraftFromFileCache(matterId);
            if (json) source = 'file-cache';
        }
        if (!json && fs.existsSync(jsonPath(matterId))) {
            json = JSON.parse(fs.readFileSync(jsonPath(matterId), 'utf-8'));
            source = 'json-file';
        }
    } catch { }
    trackEvent('CCL.Load', {
        matterId: String(matterId), exists: String(exists), source,
        hasDraft: String(!!json),
    });
    res.json({ ok: true, exists, url: exists ? `/ccls/${matterId}.docx` : undefined, json });
});

module.exports = { router, CCL_DIR };
