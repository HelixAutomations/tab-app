const express = require('express');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const {
    saveCclContent,
    saveCclAiTrace,
    markCclUploaded,
    updateCclStatus,
    getLatestCclContent,
    getCclContentHistory,
    getCclAiTraces,
} = require('../utils/cclPersistence');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { resolveRequestActor } = require('../utils/requestActor');
const cclAiRouter = require('./ccl-ai');

const previewCclContext = cclAiRouter.previewCclContext;
const runCclAiFill = cclAiRouter.runCclAiFill;
const CCL_PROMPT_VERSION = cclAiRouter.CCL_PROMPT_VERSION || 'ccl-ai-v2';
const CCL_TEMPLATE_VERSION = 'helix-ccl-template-v1';

// ─── Azure Blob Storage for CCL documents ────────────────────────────────────
let blobServiceClient = null;
const CCL_BLOB_CONTAINER = process.env.CCL_BLOB_CONTAINER || 'ccl-documents';
const STORAGE_ACCOUNT_NAME = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_NAME || 'instructionfiles';

function getCclBlobServiceClient() {
    if (blobServiceClient) return blobServiceClient;
    try {
        const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
        const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
        const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
        if (connectionString) {
            blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            return blobServiceClient;
        }
        if (accountKey) {
            const cred = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
            blobServiceClient = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, cred);
            return blobServiceClient;
        }
        const { DefaultAzureCredential } = require('@azure/identity');
        const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
        blobServiceClient = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, credential);
        return blobServiceClient;
    } catch (err) {
        console.warn('[ccl] Azure Blob client init failed (will use local only):', err.message);
        return null;
    }
}

async function uploadCclToBlob(matterId, docxPath) {
    const client = getCclBlobServiceClient();
    if (!client) return null;
    try {
        const containerClient = client.getContainerClient(CCL_BLOB_CONTAINER);
        await containerClient.createIfNotExists();
        const blobName = `${matterId}.docx`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const fileBuffer = fs.readFileSync(docxPath);
        await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
            blobHTTPHeaders: { blobContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        });
        const blobUrl = blockBlobClient.url;
        trackEvent('CCL.Blob.Uploaded', { matterId: String(matterId), blobUrl, size: String(fileBuffer.length) });
        return blobUrl;
    } catch (err) {
        console.warn('[ccl] Azure Blob upload failed (non-blocking):', err.message);
        trackException(err, { operation: 'CCL.Blob.Upload', matterId: String(matterId) });
        return null;
    }
}

/**
 * Generate a short-lived read-only SAS URL for a CCL blob.
 * Returns null if blob infra is unavailable or the blob doesn't exist.
 */
async function generateCclReadSasUrl(matterId, minutes = 60) {
    const client = getCclBlobServiceClient();
    if (!client) return null;
    try {
        const { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');
        const containerName = CCL_BLOB_CONTAINER;
        const blobName = `${matterId}.docx`;
        const containerClient = client.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Check blob exists
        const exists = await blockBlobClient.exists();
        if (!exists) return null;

        const now = new Date();
        const startsOn = new Date(now.valueOf() - 5 * 60 * 1000);
        const expiresOn = new Date(now.valueOf() + minutes * 60 * 1000);

        // Prefer AAD user delegation SAS; fall back to shared key
        try {
            const userDelegationKey = await client.getUserDelegationKey(startsOn, expiresOn);
            const sas = generateBlobSASQueryParameters(
                { containerName, blobName, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn,
                  contentDisposition: `inline; filename="CCL-${matterId}.docx"` },
                userDelegationKey,
                STORAGE_ACCOUNT_NAME,
            ).toString();
            return `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
        } catch (_) {
            const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
            if (!accountKey) throw _;
            const sharedKeyCred = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
            const sas = generateBlobSASQueryParameters(
                { containerName, blobName, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn,
                  contentDisposition: `inline; filename="CCL-${matterId}.docx"` },
                sharedKeyCred,
            ).toString();
            return `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
        }
    } catch (err) {
        console.warn('[ccl] SAS generation failed:', err.message);
        trackException(err, { operation: 'CCL.SAS.Generate', matterId: String(matterId) });
        return null;
    }
}
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
    // Handler name: prefer team_assignments, fall back to draft fields (AI-first flow)
    const handlerCandidate = flat.team_assignments?.fee_earner || flat.name_of_person_handling_matter || flat.handlerName || '';
    flat.name_of_person_handling_matter = handlerCandidate;

    const feeUser = findUserByName(handlerCandidate);
    flat.status = feeUser?.Role || flat.status || flat.handlerRole || '';
    flat.email = feeUser?.Email || flat.email || flat.fee_earner_email || '';
    flat.fee_earner_email = feeUser?.Email || flat.fee_earner_email || flat.email || '';
    flat.fee_earner_phone = feeUser?.Phone || flat.fee_earner_phone || '';
    flat.fee_earner_postal_address = feeUser?.Address || flat.fee_earner_postal_address || '';

    // Set hourly rate based on role
    const rateMap = { Partner: '395', 'Senior Partner': '395', 'Senior Associate': '395', Associate: '325', Solicitor: '285', Consultant: '395', 'Trainee Solicitor': '195' };
    if (!flat.handler_hourly_rate) flat.handler_hourly_rate = rateMap[flat.status] || flat.handlerRate || '395';

    const helpers = [
        flat.team_assignments?.fee_earner || handlerCandidate,
        flat.team_assignments?.originating_solicitor,
        flat.team_assignments?.supervising_partner
    ].filter(Boolean);
    // If we only have the handler (no team_assignments), add other team members as backup contacts
    if (helpers.length <= 1 && handlerCandidate) {
        const otherMembers = (localUsers || [])
            .filter(u => {
                const name = u['Full Name'] || `${u.First || ''} ${u.Last || ''}`.trim();
                return name && name.toLowerCase() !== handlerCandidate.toLowerCase();
            })
            .slice(0, 2);
        otherMembers.forEach(u => {
            const name = u['Full Name'] || `${u.First || ''} ${u.Last || ''}`.trim();
            if (name && !helpers.includes(name)) helpers.push(name);
        });
    }
    flat.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries = helpers.map(n => {
        const u = findUserByName(n);
        return u ? `${n} (${u.Role || ''}) — ${u.Email || ''}`.replace(/\(\)\s*—\s*/, '').trim() : n;
    }).join('\n');

    if (!flat.identify_the_other_party_eg_your_opponents) {
        const opp = flat.opponents?.[0];
        if (opp) flat.identify_the_other_party_eg_your_opponents = opp.name || opp.company || '';
    }

    flat.name_of_handler = flat.name_of_person_handling_matter;
    flat.handler = flat.name_of_person_handling_matter;

    // Resolve supervising partner: prefer team_assignments, fall back to draft, then find a partner in team data
    let supervisingName = flat.team_assignments?.supervising_partner || flat.name || '';
    if (supervisingName && !supervisingName.includes(' ')) {
        const supMatch = (localUsers || []).find(u => {
            const first = (u.First || (u['Full Name'] || '').split(/\s+/)[0] || '').trim();
            return first.toLowerCase() === supervisingName.toLowerCase();
        });
        if (supMatch) supervisingName = supMatch['Full Name'] || `${supMatch.First} ${supMatch.Last}`.trim() || supervisingName;
    }
    // If still no supervisor, find any partner in the team data
    if (!supervisingName) {
        const partnerUser = (localUsers || []).find(u => {
            const role = String(u.Role || '').toLowerCase();
            return role === 'partner' || role === 'senior partner';
        });
        if (partnerUser) supervisingName = partnerUser['Full Name'] || `${partnerUser.First || ''} ${partnerUser.Last || ''}`.trim();
    }
    flat.name = supervisingName;

    // Section 6 — matter reference
    if (!flat.matter_number && matterData.display_number) flat.matter_number = matterData.display_number;

    // Section 7 — costs update cadence default
    if (!flat.and_or_intervals_eg_every_three_months) flat.and_or_intervals_eg_every_three_months = ', when appropriate';

    // Section 16 — Referral default (no introducer for most Helix matters)
    if (!flat.explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement) {
        flat.explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement =
            'There is no referral or fee sharing arrangement in respect of this matter.';
    }

    // Section 17 — Cancellation notice reference
    if (!flat.instructions_link) flat.instructions_link = '[instruction platform — link to follow]';

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

function safeParseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function buildFieldSummary(fields) {
    const allKeys = [...new Set([...cclTokens, ...EXTRA_TOKENS])];
    const populatedKeys = allKeys.filter((key) => String(fields?.[key] || '').trim().length > 0);
    const missingKeys = allKeys.filter((key) => String(fields?.[key] || '').trim().length === 0);
    return {
        total: allKeys.length,
        populated: populatedKeys.length,
        missing: missingKeys.length,
        populatedKeys,
        missingKeys,
    };
}

function mergeDraftWithAiFields(baseDraft = {}, aiFields = {}) {
    const merged = { ...baseDraft };
    for (const [key, value] of Object.entries(aiFields || {})) {
        const current = String(merged[key] || '').trim();
        const isPlaceholder = /^\{\{.*\}\}$/.test(current);
        if (!current || current.length < 5 || isPlaceholder) {
            merged[key] = value;
        }
    }
    if (!merged.figure && merged.state_amount) merged.figure = merged.state_amount;
    if (!merged.state_amount && merged.figure) merged.state_amount = merged.figure;
    return merged;
}

function buildMissingDataFlags(preview) {
    const fields = preview?.contextFields || {};
    const snippets = preview?.snippets || {};
    const flags = [];
    if (!String(fields.practiceArea || '').trim()) flags.push('Practice area missing');
    if (!String(fields.clientName || '').trim()) flags.push('Client name missing');
    if (!String(fields.handlerName || '').trim()) flags.push('Fee earner missing');
    if (!String(fields.dealAmount || fields.pitchAmount || '').trim()) flags.push('No agreed fee or pitch amount');
    if (!String(snippets.initialCallNotes || snippets.enquiryNotes || '').trim()) flags.push('No enquiry narrative');
    if (!String(snippets.pitchEmailBody || snippets.dealServiceDescription || snippets.pitchServiceDescription || '').trim()) flags.push('No scoped service wording');
    if (!String(snippets.callTranscripts || '').trim()) flags.push('No call transcripts');
    return flags;
}

function buildSourceCoverage(preview) {
    const fields = preview?.contextFields || {};
    const snippets = preview?.snippets || {};
    const hasText = (value) => String(value || '').trim().length > 0;
    const hasAnyText = (...values) => values.some((value) => hasText(value));

    return [
        {
            key: 'matterFacts',
            label: 'Matter facts',
            status: hasAnyText(fields.practiceArea, fields.clientName, fields.handlerName) ? 'ready' : 'missing',
            summary: hasAnyText(fields.practiceArea, fields.clientName, fields.handlerName)
                ? [fields.practiceArea, fields.clientName, fields.handlerName].filter(Boolean).join(' · ')
                : 'Matter description, client, or handler still missing',
        },
        {
            key: 'instructionFacts',
            label: 'Instruction facts',
            status: hasAnyText(fields.instructionStage, fields.clientType, fields.company) ? 'ready' : 'limited',
            summary: hasAnyText(fields.instructionStage, fields.clientType, fields.company)
                ? [fields.instructionStage, fields.clientType, fields.company].filter(Boolean).join(' · ')
                : 'No instruction-stage detail surfaced yet',
        },
        {
            key: 'dealFacts',
            label: 'Deal / fee facts',
            status: hasAnyText(fields.dealAmount, fields.pitchAmount, snippets.dealServiceDescription) ? 'ready' : 'missing',
            summary: hasAnyText(fields.dealAmount, fields.pitchAmount, snippets.dealServiceDescription)
                ? [fields.dealAmount ? `Deal £${fields.dealAmount}` : '', fields.pitchAmount ? `Pitch £${fields.pitchAmount}` : '', snippets.dealServiceDescription || ''].filter(Boolean).join(' · ')
                : 'No agreed fee or deal scope found',
        },
        {
            key: 'timelineEvidence',
            label: 'Timeline evidence',
            status: hasAnyText(snippets.initialCallNotes, snippets.enquiryNotes, snippets.instructionNotes) ? 'ready' : 'missing',
            summary: hasAnyText(snippets.initialCallNotes, snippets.enquiryNotes, snippets.instructionNotes)
                ? 'Initial call, enquiry, or instruction notes available'
                : 'No narrative notes available',
        },
        {
            key: 'emailEvidence',
            label: 'Email evidence',
            status: hasAnyText(snippets.pitchEmailBody, snippets.pitchServiceDescription) ? 'ready' : 'limited',
            summary: hasAnyText(snippets.pitchEmailBody, snippets.pitchServiceDescription)
                ? 'Pitch email or pitch scope captured'
                : 'No outbound pitch wording found',
        },
        {
            key: 'transcriptEvidence',
            label: 'Transcript evidence',
            status: hasAnyText(snippets.callTranscripts) ? 'ready' : 'limited',
            summary: hasAnyText(snippets.callTranscripts)
                ? 'Call transcript context available'
                : 'No call transcripts currently available',
        },
        {
            key: 'feeScopeEvidence',
            label: 'Fee / scope confidence',
            status: hasAnyText(fields.dealAmount, fields.pitchAmount, snippets.pitchEmailBody, snippets.dealServiceDescription) ? 'ready' : 'missing',
            summary: hasAnyText(fields.dealAmount, fields.pitchAmount, snippets.pitchEmailBody, snippets.dealServiceDescription)
                ? 'Costs can be grounded to deal or pitch data'
                : 'Costs likely to fall back to practice-area defaults',
        },
    ];
}

function normalizeTraceConfidence(value) {
    const confidence = String(value || '').trim().toLowerCase();
    if (confidence === 'full' || confidence === 'partial' || confidence === 'fallback') {
        return confidence;
    }
    return 'none';
}

function toTimestamp(value) {
    if (!value) return 0;
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildCompileSummary(preview, sourceCoverage, missingDataFlags) {
    const coverage = Array.isArray(sourceCoverage) ? sourceCoverage : [];
    return {
        sourceCount: Array.isArray(preview?.dataSources) ? preview.dataSources.length : 0,
        readyCount: coverage.filter((item) => item?.status === 'ready').length,
        limitedCount: coverage.filter((item) => item?.status === 'limited').length,
        missingCount: coverage.filter((item) => item?.status === 'missing').length,
        missingFlagsCount: Array.isArray(missingDataFlags) ? missingDataFlags.length : 0,
        contextFieldCount: preview?.contextFields ? Object.keys(preview.contextFields).length : 0,
        snippetCount: preview?.snippets ? Object.keys(preview.snippets).length : 0,
    };
}

async function compileCclContext(input, actor = 'system', options = {}) {
    const { persist = true } = options;
    const trackingId = Math.random().toString(36).slice(2, 10);
    const startMs = Date.now();
    const preview = await previewCclContext(input);
    const sourceCoverage = buildSourceCoverage(preview);
    const missingDataFlags = buildMissingDataFlags(preview);
    const summary = buildCompileSummary(preview, sourceCoverage, missingDataFlags);
    const durationMs = Date.now() - startMs;

    let traceId = null;
    if (persist) {
        try {
            traceId = await saveCclAiTrace({
                matterId: input.matterId,
                trackingId,
                aiStatus: 'compiled',
                model: 'context-preview',
                durationMs,
                userPrompt: preview.userPrompt,
                userPromptLength: preview.userPromptLength,
                aiOutputJson: { summary, sourceCoverage, missingDataFlags },
                generatedFieldCount: 0,
                dataSourcesJson: preview.dataSources || [],
                contextFieldsJson: preview.contextFields || {},
                contextSnippetsJson: preview.snippets || {},
                createdBy: actor,
            });
        } catch (err) {
            console.warn('[ccl] compile trace persist failed:', err.message);
        }
    }

    return {
        ok: true,
        trackingId,
        traceId,
        createdAt: new Date().toISOString(),
        durationMs,
        preview,
        sourceCoverage,
        missingDataFlags,
        summary,
    };
}

function deriveAttentionReason({ stage, fieldSummary, confidence }) {
    if (stage !== 'generated') {
        return 'none';
    }

    if ((fieldSummary?.missing || 0) > 0) {
        return 'missing_fields';
    }

    if (confidence === 'partial' || confidence === 'fallback') {
        return 'low_confidence';
    }

    return 'none';
}

function deriveServiceStatus({ latestContent, fieldSummary, matterCclDate, latestTrace, latestCompileTrace = null }) {
    const status = String(latestContent?.Status || '').toLowerCase();
    const confidence = normalizeTraceConfidence(latestTrace?.Confidence || latestTrace?.confidence);
    const latestContentAt = Math.max(toTimestamp(latestContent?.CreatedAt), toTimestamp(latestContent?.UpdatedAt));
    const latestCompileAt = Math.max(toTimestamp(latestCompileTrace?.CreatedAt), toTimestamp(latestCompileTrace?.createdAt));

    let key = 'pending';
    let label = 'Pending';
    let tone = 'neutral';

    if (status === 'uploaded' || matterCclDate) {
        key = 'sent';
        label = 'Sent';
        tone = 'success';
    } else if (status === 'approved' || status === 'final') {
        key = 'reviewed';
        label = 'Reviewed';
        tone = 'accent';
    } else if (status === 'pressure-tested' || status === 'pressure_tested' || status === 'pressuretested') {
        key = 'pressure-tested';
        label = 'Pressure tested';
        tone = 'accent';
    } else if (latestCompileAt > latestContentAt && status !== 'approved' && status !== 'final') {
        key = 'compiled';
        label = 'Compiled';
        tone = 'accent';
    } else if (!latestContent && latestCompileAt > 0) {
        key = 'compiled';
        label = 'Compiled';
        tone = 'accent';
    } else if (latestContent || fieldSummary.populated > 0) {
        key = 'generated';
        label = 'Generated';
        tone = 'accent';
    }

    const attentionReason = deriveAttentionReason({ stage: key, fieldSummary, confidence });
    const needsAttention = attentionReason !== 'none';

    if (key === 'generated' && needsAttention) {
        tone = 'warning';
    }

    return {
        key,
        label,
        tone,
        needsAttention,
        attentionReason,
        confidence,
    };
}

async function persistCclSnapshot({
    matterId,
    draftJson,
    user,
    provenanceJson,
    templateVersion = CCL_TEMPLATE_VERSION,
    aiTraceId = null,
}) {
    const merged = await mergeMatterFields(matterId, draftJson);
    try { await saveDraftToDb(matterId, merged); } catch (dbErr) { console.warn('[ccl] Draft DB save failed (non-blocking):', dbErr.message); }
    saveDraftToFileCache(matterId, merged);

    let cclContentId = null;
    try {
        cclContentId = await saveCclContent({
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
            provenanceJson: provenanceJson || draftJson._provenance || null,
            templateVersion,
            aiTraceId,
            status: 'draft',
            createdBy: user,
        });
    } catch (err) {
        console.warn('[ccl] CclContent save failed (non-blocking):', err.message);
    }

    const docxFile = filePath(matterId);
    const generationMeta = await generateWordFromJson(merged, docxFile);
    const unresolvedPlaceholders = generationMeta?.unresolvedPlaceholders || [];
    fs.writeFileSync(jsonPath(matterId), JSON.stringify(merged, null, 2));

    const blobUrl = await uploadCclToBlob(matterId, docxFile).catch(err => {
        console.warn('[ccl] Blob upload error (non-blocking):', err.message);
        return null;
    });

    const fieldSummary = buildFieldSummary(merged);

    return {
        merged,
        cclContentId,
        url: `/ccls/${matterId}.docx`,
        blobUrl: blobUrl || undefined,
        unresolvedPlaceholders,
        unresolvedCount: unresolvedPlaceholders.length,
        fieldSummary,
        fieldCount: fieldSummary.populated,
    };
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
        const result = await persistCclSnapshot({
            matterId,
            draftJson,
            user,
            provenanceJson: draftJson._provenance || null,
        });

        const durationMs = Date.now() - startMs;
        trackEvent('CCL.Generate.Completed', {
            matterId: String(matterId), user, durationMs: String(durationMs),
            fieldCount: String(result.fieldCount),
            feeEarner: result.merged.name_of_person_handling_matter || '',
            practiceArea: result.merged.team_assignments?.practice_area || '',
            blobUrl: result.blobUrl || 'none',
        });
        if (result.unresolvedPlaceholders.length > 0) {
            trackEvent('CCL.Generate.UnresolvedPlaceholders', {
                matterId: String(matterId),
                unresolvedCount: String(result.unresolvedPlaceholders.length),
                unresolvedFields: result.unresolvedPlaceholders.join(', '),
            });
        }
        trackMetric('CCL.Generate.Duration', durationMs, { matterId: String(matterId) });
        trackMetric('CCL.Generate.FieldCount', result.fieldCount, { matterId: String(matterId) });

        res.json({
            ok: true,
            url: result.url,
            blobUrl: result.blobUrl,
            unresolvedPlaceholders: result.unresolvedPlaceholders,
            unresolvedCount: result.unresolvedCount,
        });
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
        const result = await persistCclSnapshot({
            matterId,
            draftJson,
            user,
            provenanceJson: draftJson._provenance || null,
        });

        const durationMs = Date.now() - startMs;
        trackEvent('CCL.Save.Completed', {
            matterId: String(matterId), user, durationMs: String(durationMs),
            fieldCount: String(result.fieldCount),
            feeEarner: result.merged.name_of_person_handling_matter || '',
            practiceArea: result.merged.team_assignments?.practice_area || '',
            blobUrl: result.blobUrl || 'none',
        });
        if (result.unresolvedPlaceholders.length > 0) {
            trackEvent('CCL.Save.UnresolvedPlaceholders', {
                matterId: String(matterId),
                unresolvedCount: String(result.unresolvedPlaceholders.length),
                unresolvedFields: result.unresolvedPlaceholders.join(', '),
            });
        }
        trackMetric('CCL.Save.Duration', durationMs, { matterId: String(matterId) });

        res.json({
            ok: true,
            url: result.url,
            blobUrl: result.blobUrl,
            unresolvedPlaceholders: result.unresolvedPlaceholders,
            unresolvedCount: result.unresolvedCount,
        });
    } catch (err) {
        console.error('CCL regeneration failed', err);
        trackException(err, { operation: 'CCL.Save', matterId: String(matterId), user });
        trackEvent('CCL.Save.Failed', { matterId: String(matterId), user, error: err.message });
        res.status(500).json({ error: 'Failed to regenerate CCL' });
    }
});

router.post('/service/run', async (req, res) => {
    const {
        matterId,
        draftJson = {},
        instructionRef,
        practiceArea,
        description,
        clientName,
        opponent,
        enquiryNotes,
        handlerName,
        handlerRole,
        handlerRate,
        stage,
        skipCompilePersistence = false,
    } = req.body || {};

    if (!matterId) {
        return res.status(400).json({ ok: false, error: 'matterId is required' });
    }

    const user = resolveRequestActor(req);
    const startMs = Date.now();
    trackEvent('CCL.Service.Run.Started', {
        matterId: String(matterId),
        instructionRef: String(instructionRef || ''),
        stage: String(stage || ''),
        triggeredBy: user,
    });

    try {
        const compile = await compileCclContext({
            matterId,
            instructionRef,
            practiceArea,
            description,
            clientName,
            opponent,
            enquiryNotes,
            handlerName,
            handlerRole,
            handlerRate,
        }, user, { persist: !skipCompilePersistence });
        const preview = compile.preview;

        const aiResult = await runCclAiFill({
            matterId,
            instructionRef,
            practiceArea,
            description,
            clientName,
            opponent,
            enquiryNotes,
            handlerName,
            handlerRole,
            handlerRate,
        }, user);

        const mergedDraft = mergeDraftWithAiFields(draftJson, aiResult.fields || {});
        // Inject handler context so mergeMatterFields can populate personnel fields
        // even when team_assignments is absent (common in the AI-first flow)
        if (handlerName && !mergedDraft.name_of_person_handling_matter) mergedDraft.name_of_person_handling_matter = handlerName;
        if (handlerRole && !mergedDraft.status) mergedDraft.status = handlerRole;
        if (handlerRate && !mergedDraft.handler_hourly_rate) mergedDraft.handler_hourly_rate = handlerRate;
        const missingDataFlags = compile.missingDataFlags;
        const sourceCoverage = compile.sourceCoverage;
        const provenance = {
            serviceVersion: 'ccl-service-v1',
            promptVersion: aiResult.promptVersion || CCL_PROMPT_VERSION,
            templateVersion: CCL_TEMPLATE_VERSION,
            sourceCoverage,
            dataSources: preview.dataSources || [],
            missingDataFlags,
            excludedSources: sourceCoverage.filter((item) => item.status !== 'ready').map((item) => item.label),
            workbenchStage: stage || '',
            contextFields: preview.contextFields || {},
            contextSnippets: preview.snippets || {},
            compile: {
                trackingId: compile.trackingId,
                traceId: compile.traceId,
                durationMs: compile.durationMs,
                createdAt: compile.createdAt,
                summary: compile.summary,
            },
            ai: {
                source: aiResult.source || '',
                confidence: aiResult.confidence || '',
                durationMs: aiResult.durationMs || null,
                fallbackReason: aiResult.fallbackReason || null,
                trackingId: aiResult.debug?.trackingId || null,
                aiTraceId: aiResult.aiTraceId || null,
            },
            lastRunAt: new Date().toISOString(),
            triggeredBy: user,
        };

        const result = await persistCclSnapshot({
            matterId,
            draftJson: { ...mergedDraft, _provenance: provenance },
            user,
            provenanceJson: provenance,
            templateVersion: CCL_TEMPLATE_VERSION,
            aiTraceId: aiResult.aiTraceId || null,
        });

        // Background pressure test — runs after persistence, does not block the response
        if (cclAiRouter.runPressureTestInternal && aiResult.fields && Object.keys(aiResult.fields).length > 0) {
            cclAiRouter.runPressureTestInternal({
                matterId,
                instructionRef,
                generatedFields: aiResult.fields,
                practiceArea,
                clientName,
                feeEarnerEmail: preview?.contextFields?.feeEarnerEmail || '',
                prospectEmail: preview?.contextFields?.prospectEmail || '',
            }).catch(err => {
                console.warn(`[ccl] Background PT failed for ${matterId}:`, err.message);
                trackEvent('CCL.PressureTest.BackgroundFailed', { matterId: String(matterId), error: err.message, triggeredBy: user });
            });
        }

        const durationMs = Date.now() - startMs;
        trackEvent('CCL.Service.Run.Completed', {
            matterId: String(matterId),
            triggeredBy: user,
            durationMs: String(durationMs),
            sourceCount: String((preview.dataSources || []).length),
            fieldCount: String(result.fieldCount),
            unresolvedCount: String(result.unresolvedCount),
        });
        trackMetric('CCL.Service.Run.Duration', durationMs, { matterId: String(matterId) });

        return res.json({
            ok: true,
            matterId,
            url: result.url,
            blobUrl: result.blobUrl,
            fields: result.merged,
            fieldSummary: result.fieldSummary,
            unresolvedPlaceholders: result.unresolvedPlaceholders,
            unresolvedCount: result.unresolvedCount,
            promptVersion: aiResult.promptVersion || CCL_PROMPT_VERSION,
            templateVersion: CCL_TEMPLATE_VERSION,
            preview,
            compile,
            ai: aiResult,
            provenance,
        });
    } catch (err) {
        console.error('[ccl] service run failed:', err.message);
        trackException(err, { operation: 'CCL.Service.Run', matterId: String(matterId), triggeredBy: user });
        trackEvent('CCL.Service.Run.Failed', { matterId: String(matterId), triggeredBy: user, error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to run CCL service' });
    }
});

router.post('/service/compile', async (req, res) => {
    const {
        matterId,
        instructionRef,
        practiceArea,
        description,
        clientName,
        opponent,
        enquiryNotes,
        handlerName,
        handlerRole,
        handlerRate,
    } = req.body || {};

    if (!matterId) {
        return res.status(400).json({ ok: false, error: 'matterId is required' });
    }

    const actor = resolveRequestActor(req);
    const startMs = Date.now();
    trackEvent('CCL.Service.Compile.Started', {
        matterId: String(matterId),
        instructionRef: String(instructionRef || ''),
        triggeredBy: actor,
    });

    try {
        const compile = await compileCclContext({
            matterId,
            instructionRef,
            practiceArea,
            description,
            clientName,
            opponent,
            enquiryNotes,
            handlerName,
            handlerRole,
            handlerRate,
        }, actor, { persist: true });

        const durationMs = Date.now() - startMs;
        trackEvent('CCL.Service.Compile.Completed', {
            matterId: String(matterId),
            triggeredBy: actor,
            durationMs: String(durationMs),
            sourceCount: String(compile.summary.sourceCount || 0),
            readyCount: String(compile.summary.readyCount || 0),
        });
        trackMetric('CCL.Service.Compile.Duration', durationMs, { matterId: String(matterId) });
        return res.json({ ok: true, matterId, compile });
    } catch (err) {
        console.error('[ccl] service compile failed:', err.message);
        trackException(err, { operation: 'CCL.Service.Compile', matterId: String(matterId), triggeredBy: actor });
        trackEvent('CCL.Service.Compile.Failed', { matterId: String(matterId), triggeredBy: actor, error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to compile CCL context' });
    }
});

router.get('/:matterId/workbench', async (req, res) => {
    const { matterId } = req.params;
    const {
        instructionRef,
        practiceArea,
        description,
        clientName,
        opponent,
        enquiryNotes,
        handlerName,
        handlerRole,
        handlerRate,
        stage,
        passcode,
        clientId,
        portalUrl,
        cclDate,
        displayNumber,
    } = req.query || {};

    const actor = resolveRequestActor(req);
    trackEvent('CCL.Workbench.Load.Started', { matterId: String(matterId), actor, stage: String(stage || '') });

    try {
        const [latestContent, history, traces] = await Promise.all([
            getLatestCclContent(matterId),
            getCclContentHistory(matterId),
            getCclAiTraces(matterId, 5),
        ]);

        const draft = await fetchDraftFromDb(matterId) || loadDraftFromFileCache(matterId) || (fs.existsSync(jsonPath(matterId)) ? safeParseJson(fs.readFileSync(jsonPath(matterId), 'utf-8'), null) : null);
        const preview = await previewCclContext({
            matterId,
            instructionRef,
            practiceArea,
            description,
            clientName,
            opponent,
            enquiryNotes,
            handlerName,
            handlerRole,
            handlerRate,
        }).catch(() => null);

        const latestTrace = traces?.find((trace) => ['complete', 'partial', 'fallback'].includes(String(trace?.AiStatus || '').toLowerCase())) || null;
        const latestCompileTrace = traces?.find((trace) => String(trace?.AiStatus || '').toLowerCase() === 'compiled') || null;
        const latestFields = draft || safeParseJson(latestContent?.FieldsJson, {}) || {};
        const provenance = safeParseJson(latestContent?.ProvenanceJson, {}) || {};
        const traceContextFields = safeParseJson(latestTrace?.ContextFieldsJson, {}) || {};
        const traceSnippets = safeParseJson(latestTrace?.ContextSnippetsJson, {}) || {};
        const fieldSummary = buildFieldSummary(latestFields);
        const fieldValues = {};
        for (const key of fieldSummary.populatedKeys) {
            const val = String(latestFields[key] || '').trim();
            if (val) fieldValues[key] = val.length > 300 ? val.slice(0, 300) + '…' : val;
        }
        const serviceStatus = deriveServiceStatus({ latestContent, fieldSummary, matterCclDate: cclDate, latestTrace, latestCompileTrace });
        const sourcePreview = preview || {
            dataSources: provenance.dataSources || safeParseJson(latestTrace?.DataSourcesJson, []) || [],
            contextFields: provenance.contextFields || traceContextFields,
            snippets: provenance.contextSnippets || traceSnippets,
            userPromptLength: latestTrace?.UserPromptLength || 0,
            systemPromptLength: 0,
            promptVersion: provenance.promptVersion || CCL_PROMPT_VERSION,
        };
        const sourceCoverage = Array.isArray(provenance.sourceCoverage) && provenance.sourceCoverage.length > 0
            ? provenance.sourceCoverage
            : buildSourceCoverage(sourcePreview);
        const missingDataFlags = Array.isArray(provenance.missingDataFlags) && provenance.missingDataFlags.length > 0
            ? provenance.missingDataFlags
            : buildMissingDataFlags(sourcePreview);

        const response = {
            ok: true,
            matterId,
            displayNumber: String(displayNumber || matterId),
            service: {
                status: serviceStatus,
                stage: serviceStatus.key,
                version: latestContent?.Version || null,
                contentId: latestContent?.CclContentId || null,
                createdAt: latestContent?.CreatedAt || null,
                reviewedAt: latestContent?.FinalizedAt || null,
                sentAt: latestContent?.FinalizedAt || null,
                uploadedToClio: Boolean(latestContent?.UploadedToClio),
                uploadedToNd: Boolean(latestContent?.UploadedToNd),
                unresolvedCount: fieldSummary.missing,
                attentionReason: serviceStatus.attentionReason,
                confidence: serviceStatus.confidence,
                fieldSummary,
                documentUrl: fs.existsSync(filePath(matterId)) ? `/ccls/${matterId}.docx` : null,
                compiledAt: provenance.compile?.createdAt || latestCompileTrace?.CreatedAt || null,
            },
            compile: {
                trackingId: provenance.compile?.trackingId || latestCompileTrace?.TrackingId || null,
                traceId: provenance.compile?.traceId || latestCompileTrace?.CclAiTraceId || null,
                createdAt: provenance.compile?.createdAt || latestCompileTrace?.CreatedAt || null,
                durationMs: provenance.compile?.durationMs || latestCompileTrace?.DurationMs || null,
                summary: provenance.compile?.summary || buildCompileSummary(sourcePreview, sourceCoverage, missingDataFlags),
            },
            prompt: {
                version: provenance.promptVersion || sourcePreview.promptVersion || CCL_PROMPT_VERSION,
                templateVersion: latestContent?.TemplateVersion || provenance.templateVersion || CCL_TEMPLATE_VERSION,
                userPromptLength: sourcePreview.userPromptLength || latestTrace?.UserPromptLength || 0,
                systemPromptLength: sourcePreview.systemPromptLength || 0,
                dataSources: sourcePreview.dataSources || [],
            },
            sourceCoverage,
            missingDataFlags,
            fieldValues,
            sourcePreview: {
                contextFields: sourcePreview.contextFields || {},
                snippets: sourcePreview.snippets || {},
            },
            trace: latestTrace ? {
                trackingId: latestTrace.TrackingId || null,
                aiStatus: latestTrace.AiStatus || null,
                confidence: latestTrace.Confidence || null,
                durationMs: latestTrace.DurationMs || null,
                generatedFieldCount: latestTrace.GeneratedFieldCount || null,
                fallbackReason: latestTrace.FallbackReason || null,
                errorMessage: latestTrace.ErrorMessage || null,
                createdAt: latestTrace.CreatedAt || null,
            } : null,
            linkage: {
                instructionRef: String(instructionRef || ''),
                stage: String(stage || ''),
                clientId: String(clientId || ''),
                passcode: String(passcode || ''),
                portalUrl: String(portalUrl || ''),
                passcodeAvailable: Boolean(passcode),
                portalReady: Boolean(portalUrl),
            },
            history: Array.isArray(history) ? history.slice(0, 5).map((item) => ({
                version: item.Version,
                status: item.Status,
                createdAt: item.CreatedAt,
                finalizedAt: item.FinalizedAt,
                createdBy: item.CreatedBy,
            })) : [],
        };

        trackEvent('CCL.Workbench.Load.Completed', {
            matterId: String(matterId),
            actor,
            sourceCount: String((response.prompt.dataSources || []).length),
            unresolvedCount: String(response.service.unresolvedCount || 0),
            status: response.service.status.key,
        });

        return res.json(response);
    } catch (err) {
        console.error('[ccl] workbench load failed:', err.message);
        trackException(err, { operation: 'CCL.Workbench.Load', matterId: String(matterId), actor });
        trackEvent('CCL.Workbench.Load.Failed', { matterId: String(matterId), actor, error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to load CCL workbench' });
    }
});

// ─── Approve CCL ──────────────────────────────────────────────────────────
// POST /api/ccl/:matterId/approve
// Transitions latest CclContent from draft → approved (or approved → uploaded).
router.post('/:matterId/approve', async (req, res) => {
    const { matterId } = req.params;
    const { targetStatus } = req.body || {};
    const status = targetStatus || 'approved';
    const user = resolveRequestActor(req);
    const startMs = Date.now();
    trackEvent('CCL.Approve.Started', { matterId: String(matterId), targetStatus: status, user });
    try {
        const updated = await updateCclStatus(matterId, status, { actor: user });
        if (!updated) {
            trackEvent('CCL.Approve.Rejected', { matterId: String(matterId), targetStatus: status, user, reason: 'invalid_transition_or_not_found' });
            return res.status(409).json({ ok: false, error: 'Cannot transition to that status (check current status).' });
        }
        const durationMs = Date.now() - startMs;
        trackEvent('CCL.Approve.Completed', {
            matterId: String(matterId), status: updated.Status,
            version: String(updated.Version), user, durationMs: String(durationMs),
        });
        trackMetric('CCL.Approve.Duration', durationMs, { matterId: String(matterId) });
        res.json({
            ok: true,
            status: updated.Status,
            version: updated.Version,
            finalizedAt: updated.FinalizedAt || null,
            finalizedBy: updated.FinalizedBy || null,
            uploadedToClio: !!updated.UploadedToClio,
        });
    } catch (err) {
        console.error('[ccl] approve failed:', err.message);
        trackException(err, { operation: 'CCL.Approve', matterId: String(matterId), user });
        trackEvent('CCL.Approve.Failed', { matterId: String(matterId), user, error: err.message });
        res.status(500).json({ ok: false, error: 'Approval failed' });
    }
});

// ─── Batch status check ───────────────────────────────────────────────────
// POST /api/ccl/batch-status  body: { matterIds: string[] }
// Returns { [matterId]: { status, version, feeEarner, practiceArea, createdAt } | null }
router.post('/batch-status', async (req, res) => {
    const { matterIds } = req.body || {};
    if (!Array.isArray(matterIds) || matterIds.length === 0) {
        return res.json({ ok: true, results: {} });
    }
    const ids = matterIds.slice(0, 50); // cap at 50
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        return res.json({ ok: true, results: {} });
    }
    let pool;
    try {
        pool = await sql.connect(connectionString);
        // Check table exists first
        const check = await pool.request().query(
            `SELECT CASE WHEN OBJECT_ID(N'CclContent', N'U') IS NOT NULL THEN 1 ELSE 0 END AS F`
        );
        if (!check?.recordset?.[0]?.F) {
            return res.json({ ok: true, results: {} });
        }
        // Build parameterised IN clause
        const request = pool.request();
        const placeholders = ids.map((id, i) => {
            request.input(`m${i}`, sql.NVarChar(50), String(id));
            return `@m${i}`;
        });
        const result = await request.query(`
                 SELECT c.MatterId, c.Status, c.Version, c.FeeEarner,
                     c.PracticeArea, c.CreatedAt, c.ClientName, c.MatterDescription,
                     c.FinalizedAt, c.UploadedToClio, c.UploadedToNd, c.FieldsJson, c.ProvenanceJson,
                     t.Confidence AS TraceConfidence
            FROM CclContent c
                 LEFT JOIN CclAiTrace t ON c.AiTraceId = t.CclAiTraceId
            INNER JOIN (
                SELECT MatterId, MAX(Version) AS MaxV
                FROM CclContent WHERE MatterId IN (${placeholders.join(',')})
                GROUP BY MatterId
            ) latest ON c.MatterId = latest.MatterId AND c.Version = latest.MaxV
        `);
        const compileRequest = pool.request();
        const compilePlaceholders = ids.map((id, i) => {
            compileRequest.input(`cm${i}`, sql.NVarChar(50), String(id));
            return `@cm${i}`;
        });
        const compileResult = await compileRequest.query(`
            SELECT MatterId, TrackingId, CclAiTraceId, CreatedAt
            FROM (
                SELECT MatterId, TrackingId, CclAiTraceId, CreatedAt,
                    ROW_NUMBER() OVER (PARTITION BY MatterId ORDER BY CreatedAt DESC, CclAiTraceId DESC) AS rn
                FROM CclAiTrace
                WHERE MatterId IN (${compilePlaceholders.join(',')})
                  AND AiStatus = 'compiled'
            ) ranked
            WHERE rn = 1
        `);
        const latestCompileTraceByMatter = compileResult.recordset.reduce((acc, row) => {
            acc[row.MatterId] = row;
            return acc;
        }, {});
        const results = {};
        for (const row of result.recordset) {
            const fields = safeParseJson(row.FieldsJson, {});
            const provenance = safeParseJson(row.ProvenanceJson, {}) || {};
            const fieldSummary = buildFieldSummary(fields || {});
            const derivedStatus = deriveServiceStatus({
                latestContent: row,
                fieldSummary,
                matterCclDate: null,
                latestTrace: { Confidence: row.TraceConfidence || null },
                latestCompileTrace: latestCompileTraceByMatter[row.MatterId] || null,
            });
            results[row.MatterId] = {
                status: derivedStatus.key,
                rawStatus: row.Status,
                stage: derivedStatus.key,
                label: derivedStatus.label,
                needsAttention: derivedStatus.needsAttention,
                attentionReason: derivedStatus.attentionReason,
                confidence: derivedStatus.confidence,
                version: row.Version,
                feeEarner: row.FeeEarner,
                practiceArea: row.PracticeArea,
                clientName: row.ClientName,
                matterDescription: row.MatterDescription,
                createdAt: row.CreatedAt,
                compiledAt: provenance.compile?.createdAt || latestCompileTraceByMatter[row.MatterId]?.CreatedAt || null,
                generatedAt: row.CreatedAt,
                finalizedAt: row.FinalizedAt || null,
                reviewedAt: row.FinalizedAt || null,
                sentAt: row.FinalizedAt || null,
                uploadedToClio: !!row.UploadedToClio,
                uploadedToNd: !!row.UploadedToNd,
                unresolvedCount: fieldSummary.missing,
                compileSummary: provenance.compile?.summary || null,
            };
        }
        const matterIdsWithContent = new Set(Object.keys(results));
        for (const [matterId, compileTrace] of Object.entries(latestCompileTraceByMatter)) {
            if (matterIdsWithContent.has(matterId)) continue;
            results[matterId] = {
                status: 'compiled',
                rawStatus: 'compiled',
                stage: 'compiled',
                label: 'Compiled',
                needsAttention: false,
                attentionReason: 'none',
                confidence: 'none',
                version: 0,
                createdAt: compileTrace.CreatedAt || null,
                compiledAt: compileTrace.CreatedAt || null,
                generatedAt: null,
                finalizedAt: null,
                reviewedAt: null,
                sentAt: null,
                uploadedToClio: false,
                uploadedToNd: false,
                unresolvedCount: 0,
            };
        }
        trackEvent('CCL.BatchStatus', { count: String(ids.length), found: String(Object.keys(results).length) });
        return res.json({ ok: true, results });
    } catch (err) {
        console.error('[ccl] batch-status failed:', err.message);
        trackException(err, { operation: 'CCL.BatchStatus' });
        return res.json({ ok: true, results: {} }); // non-fatal
    } finally {
        if (pool) await pool.close();
    }
});

// ─── Preview: Office Online viewer via SAS URL ──────────────────────────────
router.get('/:matterId/preview', async (req, res) => {
    const { matterId } = req.params;
    try {
        const sasUrl = await generateCclReadSasUrl(matterId, 60);
        if (!sasUrl) {
            trackEvent('CCL.Preview.NoBlobFound', { matterId: String(matterId) });
            return res.status(404).json({ ok: false, error: 'No document found in blob storage for this matter.' });
        }
        const previewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(sasUrl)}`;
        const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sasUrl)}`;
        trackEvent('CCL.Preview.Generated', { matterId: String(matterId) });
        return res.json({ ok: true, previewUrl, embedUrl, sasUrl });
    } catch (err) {
        console.error('[ccl] Preview URL generation failed:', err.message);
        trackException(err, { operation: 'CCL.Preview', matterId: String(matterId) });
        return res.status(500).json({ ok: false, error: 'Failed to generate preview URL' });
    }
});

router.get('/:matterId', async (req, res) => {
    const { matterId } = req.params;
    const fp = filePath(matterId);
    const exists = fs.existsSync(fp);
    let json;
    let source = 'none';
    let latestContent = null;
    let history = [];
    try {
        [latestContent, history] = await Promise.all([
            getLatestCclContent(matterId).catch(() => null),
            getCclContentHistory(matterId).catch(() => []),
        ]);
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
        if (!json && latestContent?.FieldsJson) {
            json = safeParseJson(latestContent.FieldsJson, null);
            if (json) source = 'ccl-content';
        }
    } catch { }
    trackEvent('CCL.Load', {
        matterId: String(matterId), exists: String(exists), source,
        hasDraft: String(!!json),
    });
    // Hydrate persisted pressure-test result if available
    let pressureTest = null;
    if (latestContent?.PressureTestJson) {
        try {
            const fieldScores = safeParseJson(latestContent.PressureTestJson, null);
            if (fieldScores) {
                pressureTest = {
                    ok: true,
                    fieldScores,
                    flaggedCount: latestContent.PressureTestFlaggedCount ?? 0,
                    totalFields: Object.keys(fieldScores).length,
                    dataSources: safeParseJson(latestContent.PressureTestDataSources, []),
                    durationMs: latestContent.PressureTestDurationMs ?? 0,
                    trackingId: latestContent.PressureTestTrackingId ?? '',
                    completedAt: latestContent.PressureTestAt || null,
                };
            }
        } catch { }
    }

    res.json({
        ok: true,
        exists,
        url: exists ? `/ccls/${matterId}.docx` : undefined,
        json,
        pressureTest,
        loadInfo: {
            source,
            hasStoredDraft: Boolean(json),
            hasStoredVersion: Boolean(latestContent?.CclContentId),
            version: latestContent?.Version || null,
            contentId: latestContent?.CclContentId || null,
            status: latestContent?.Status || null,
            createdAt: latestContent?.CreatedAt || null,
            finalizedAt: latestContent?.FinalizedAt || null,
            historyCount: Array.isArray(history) ? history.length : 0,
        },
    });
});

module.exports = { router, CCL_DIR };
