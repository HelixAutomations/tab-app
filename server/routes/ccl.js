const express = require('express');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const { getPool } = require('../utils/db');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const {
    saveCclContent,
    saveCclFieldEdits,
    saveCclAiTrace,
    markCclUploaded,
    updateCclStatus,
    getLatestCclContent,
    getLatestCclSentForMatter,
    getLatestCclSentByMatterIds,
    getCclContentHistory,
    getCclAiTraces,
} = require('../utils/cclPersistence');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { resolveRequestActor } = require('../utils/requestActor');
const { getTeamData } = require('../utils/teamData');
const cclAiRouter = require('./ccl-ai');

const previewCclContext = cclAiRouter.previewCclContext;
const runCclAiFill = cclAiRouter.runCclAiFill;
const CCL_PROMPT_VERSION = cclAiRouter.CCL_PROMPT_VERSION || 'ccl-ai-v3-voice';
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
        const { getCredential } = require('../utils/getSecret');
        const credential = getCredential();
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

const SUPERVISOR_ROLE_DEFAULT = 'Partner';
// Roles that should be expressed as "... is a Partner" in the supervisor
// sentence. Anything not in this map keeps the role exactly as it appears in
// the team table.
const SUPERVISOR_ROLE_OVERRIDES = {
    'partner': 'Partner',
    'senior partner': 'Senior Partner',
    'managing partner': 'Managing Partner',
};

async function loadTeamRoster() {
    try {
        const data = await getTeamData();
        if (Array.isArray(data) && data.length > 0) return data;
    } catch (err) {
        console.warn('[ccl] team roster lookup failed, falling back to localUsers:', err.message);
    }
    return localUsers || [];
}

function normaliseName(s) {
    return String(s || '').trim().toLowerCase();
}

function findUserInRoster(roster, name) {
    if (!name) return null;
    const target = normaliseName(name);
    if (!target) return null;
    return (roster || []).find(u => {
        const full = normaliseName(u['Full Name'] || `${u.First || ''} ${u.Last || ''}`);
        if (full === target) return true;
        const nick = normaliseName(u.Nickname);
        if (nick && nick === target) return true;
        const initials = normaliseName(u.Initials);
        if (initials && initials === target) return true;
        // First-name only match (used to expand "Alex" → "Alex Cook").
        const first = normaliseName(u.First || (u['Full Name'] || '').split(/\s+/)[0]);
        if (first && first === target) return true;
        return false;
    }) || null;
}

function fullNameOf(user) {
    if (!user) return '';
    return user['Full Name'] || `${user.First || ''} ${user.Last || ''}`.trim();
}

function findUserByName(name) {
    if (!name) return null;
    return findUserInRoster(localUsers, name);
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

    const roster = await loadTeamRoster();

    const flat = { ...payload };
    const firstClient = flat.client_information?.[0] || {};
    // Build a human name from whatever prefix/first/last we have. We never
    // emit the string "undefined" or leave only a prefix behind.
    const prefix = String(firstClient.prefix || '').trim();
    const firstName = String(firstClient.first_name || '').trim();
    const lastName = String(firstClient.last_name || '').trim();
    const companyName = String(firstClient.company_details?.name || '').trim();
    const personName = [prefix, firstName, lastName]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (personName && (firstName || lastName)) {
        // Only accept when we have at least one real name part; otherwise a
        // bare "Mr" would slip through.
        flat.insert_clients_name = personName;
    } else if (companyName) {
        flat.insert_clients_name = companyName;
    } else if (personName) {
        // Prefix-only as a very last resort before falling back to "Sir / Madam".
        flat.insert_clients_name = personName;
    }
    if (!flat.insert_clients_name) {
        flat.insert_clients_name = 'Sir / Madam';
        try {
            trackEvent('Ccl.Addressee.Empty', {
                operation: 'mergeMatterFields',
                matterId: String(matterId || ''),
                hadFirstClient: firstClient ? 'true' : 'false',
                hadPrefix: prefix ? 'true' : 'false',
                hadFirstName: firstName ? 'true' : 'false',
                hadLastName: lastName ? 'true' : 'false',
                hadCompanyName: companyName ? 'true' : 'false',
            });
        } catch { /* telemetry best-effort */ }
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

    const feeUser = findUserInRoster(roster, handlerCandidate);
    flat.status = feeUser?.Role || flat.status || flat.handlerRole || '';
    flat.email = feeUser?.Email || flat.email || flat.fee_earner_email || '';
    flat.fee_earner_email = feeUser?.Email || flat.fee_earner_email || flat.email || '';
    flat.fee_earner_phone = feeUser?.Phone || flat.fee_earner_phone || '';
    flat.fee_earner_postal_address = feeUser?.Address || flat.fee_earner_postal_address || '';

    // Set hourly rate based on role
    const rateMap = { Partner: '395', 'Senior Partner': '395', 'Senior Associate': '395', Associate: '325', Solicitor: '285', Consultant: '395', 'Trainee Solicitor': '195' };
    if (!flat.handler_hourly_rate) flat.handler_hourly_rate = rateMap[flat.status] || flat.handlerRate || '395';

    // Build the "if X is not available" list. Three rules:
    //   1. Never include the handler themselves — the sentence already names
    //      them as the unavailable party.
    //   2. Dedupe case-insensitively (originating_solicitor and
    //      supervising_partner often resolve to the same person and we don't
    //      want them listed twice).
    //   3. Expand first-name-only entries ("Alex") to the full name pulled
    //      from the team roster ("Alex Cook").
    const helperCandidates = [
        flat.team_assignments?.originating_solicitor,
        flat.team_assignments?.supervising_partner,
    ].filter(Boolean);
    const handlerKey = normaliseName(handlerCandidate);
    const helperSet = new Map();
    for (const candidate of helperCandidates) {
        const user = findUserInRoster(roster, candidate);
        const resolved = fullNameOf(user) || candidate;
        const key = normaliseName(resolved);
        if (!key || key === handlerKey || helperSet.has(key)) continue;
        helperSet.set(key, { name: resolved, user });
    }
    // If we still have no genuine alternates, add up to two other team
    // members as backup contacts so the section isn't empty.
    if (helperSet.size === 0 && handlerCandidate) {
        for (const u of roster) {
            const name = fullNameOf(u);
            const key = normaliseName(name);
            if (!name || !key || key === handlerKey || helperSet.has(key)) continue;
            helperSet.set(key, { name, user: u });
            if (helperSet.size >= 2) break;
        }
    }
    flat.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries = Array.from(helperSet.values()).map(({ name, user }) => {
        if (!user) return name;
        const role = user.Role ? ` (${user.Role})` : '';
        const email = user.Email ? ` — ${user.Email}` : '';
        return `${name}${role}${email}`.trim();
    }).join('\n');

    if (!flat.identify_the_other_party_eg_your_opponents) {
        const opp = flat.opponents?.[0];
        if (opp) flat.identify_the_other_party_eg_your_opponents = opp.name || opp.company || '';
    }

    flat.name_of_handler = flat.name_of_person_handling_matter;
    flat.handler = flat.name_of_person_handling_matter;

    // Resolve supervising partner: prefer team_assignments, fall back to draft.
    // Always expand first-name-only inputs to the full roster name and pull
    // the actual role (e.g. "Senior Partner") so the template doesn't
    // hard-code "Partner".
    let supervisingName = flat.team_assignments?.supervising_partner || flat.name || '';
    let supervisorUser = findUserInRoster(roster, supervisingName);
    if (!supervisorUser && supervisingName) {
        // Last resort: scan the local seed (used only if roster lookup failed).
        supervisorUser = findUserByName(supervisingName);
    }
    if (supervisorUser) {
        supervisingName = fullNameOf(supervisorUser) || supervisingName;
    }
    // If still no supervisor, find any partner in the team roster.
    if (!supervisingName) {
        const partnerUser = roster.find(u => {
            const role = String(u.Role || '').toLowerCase();
            return role === 'partner' || role === 'senior partner' || role === 'managing partner';
        });
        if (partnerUser) {
            supervisingName = fullNameOf(partnerUser);
            supervisorUser = partnerUser;
        }
    }
    flat.name = supervisingName;
    const rawSupervisorRole = String(supervisorUser?.Role || flat.supervisor_role || '').trim();
    const roleKey = rawSupervisorRole.toLowerCase();
    flat.supervisor_role = SUPERVISOR_ROLE_OVERRIDES[roleKey] || rawSupervisorRole || SUPERVISOR_ROLE_DEFAULT;

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

// CclDrafts v2 shape — see scripts/migrate-ccl-drafts-v2.mjs.
// We auto-detect the column set so the server stays useful in environments
// where the migration has not been run yet (writes/reads gracefully fall back
// to the legacy 4-column shape, with file-cache as the final safety net).
let cclDraftTableShape = null; // null | 'missing' | 'v1' | 'v2'

async function ensureCclDraftsTable(pool) {
    if (cclDraftTableShape !== null) return cclDraftTableShape;
    try {
        const result = await pool.request().query(`
            SELECT
                OBJECT_ID(N'dbo.CclDrafts', N'U')              AS DraftsId,
                COL_LENGTH('dbo.CclDrafts', 'LatestCclContentId') AS HasLatest,
                COL_LENGTH('dbo.CclDrafts', 'OverrideCount')      AS HasOverride
        `);
        const row = result?.recordset?.[0] || {};
        if (!row.DraftsId) {
            trackEvent('CCL.DraftTable.Missing', { action: 'create-v1-fallback' });
            await pool.request().query(`
                CREATE TABLE dbo.CclDrafts (
                    MatterId NVARCHAR(50) NOT NULL PRIMARY KEY,
                    DraftJson NVARCHAR(MAX) NOT NULL,
                    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
                );
                CREATE NONCLUSTERED INDEX IX_CclDrafts_UpdatedAt
                    ON dbo.CclDrafts (UpdatedAt DESC);
            `);
            cclDraftTableShape = 'v1';
            trackEvent('CCL.DraftTable.Created', { shape: 'v1' });
            console.warn('[ccl] CclDrafts created in v1 shape — run scripts/migrate-ccl-drafts-v2.mjs to upgrade');
            return cclDraftTableShape;
        }
        cclDraftTableShape = (row.HasLatest !== null && row.HasOverride !== null) ? 'v2' : 'v1';
        return cclDraftTableShape;
    } catch (err) {
        cclDraftTableShape = 'missing';
        console.warn('[ccl] CclDrafts table unavailable; using file-based draft fallback only:', err.message);
        trackException(err, { operation: 'CCL.DraftTable.Ensure' });
        trackEvent('CCL.DraftTable.EnsureFailed', { error: err.message });
        return cclDraftTableShape;
    }
}

function _coerceInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}
function _coerceStr(v, max) {
    if (v === null || v === undefined) return null;
    const s = String(v);
    return max && s.length > max ? s.slice(0, max) : s;
}

/**
 * Upsert the working draft for a matter. `meta` is optional — when omitted
 * (legacy callers) only DraftJson + UpdatedAt change.
 *
 * meta = {
 *   latestCclContentId, latestVersion, latestStatus,
 *   aiTraceId, model, promptVersion, templateVersion, confidence,
 *   generatedFieldCount, updatedBy,
 *   overrideMode: 'preserve-existing' | 'replace-ai-fields',
 *   replacedVersion: number | null,
 * }
 */
async function saveDraftToDb(matterId, json, meta = null) {
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.warn('[ccl] INSTRUCTIONS_SQL_CONNECTION_STRING not configured, skipping DB save');
        return;
    }
    const pool = await getPool(connectionString);
    const shape = await ensureCclDraftsTable(pool);
    if (shape === 'missing') return;

    if (shape === 'v1') {
        await pool.request()
            .input('MatterId', sql.NVarChar(50), matterId)
            .input('DraftJson', sql.NVarChar(sql.MAX), JSON.stringify(json))
            .query(`MERGE CclDrafts AS target
                USING (SELECT @MatterId AS MatterId) AS src
                ON target.MatterId = src.MatterId
                WHEN MATCHED THEN UPDATE SET DraftJson = @DraftJson, UpdatedAt = SYSDATETIME()
                WHEN NOT MATCHED THEN INSERT (MatterId, DraftJson, UpdatedAt)
                VALUES (@MatterId, @DraftJson, SYSDATETIME());`);
        return;
    }

    const m = meta || {};
    const overrideIncrement = m.overrideMode === 'replace-ai-fields' ? 1 : 0;
    const replacedVersion = overrideIncrement ? _coerceInt(m.replacedVersion) : null;

    await pool.request()
        .input('MatterId',                   sql.NVarChar(50), matterId)
        .input('DraftJson',                  sql.NVarChar(sql.MAX), JSON.stringify(json))
        .input('LatestCclContentId',         sql.Int,           _coerceInt(m.latestCclContentId))
        .input('LatestVersion',              sql.Int,           _coerceInt(m.latestVersion))
        .input('LatestStatus',               sql.NVarChar(20),  _coerceStr(m.latestStatus, 20))
        .input('AiTraceId',                  sql.Int,           _coerceInt(m.aiTraceId))
        .input('Model',                      sql.NVarChar(80),  _coerceStr(m.model, 80))
        .input('PromptVersion',              sql.NVarChar(50),  _coerceStr(m.promptVersion, 50))
        .input('TemplateVersion',            sql.NVarChar(50),  _coerceStr(m.templateVersion, 50))
        .input('Confidence',                 sql.NVarChar(20),  _coerceStr(m.confidence, 20))
        .input('GeneratedFieldCount',        sql.Int,           _coerceInt(m.generatedFieldCount))
        .input('OverrideIncrement',          sql.Int,           overrideIncrement)
        .input('LastOverrideReplacedVersion',sql.Int,           replacedVersion)
        .input('UpdatedBy',                  sql.NVarChar(50),  _coerceStr(m.updatedBy, 50))
        .query(`MERGE dbo.CclDrafts AS target
            USING (SELECT @MatterId AS MatterId) AS src
            ON target.MatterId = src.MatterId
            WHEN MATCHED THEN UPDATE SET
                DraftJson                   = @DraftJson,
                LatestCclContentId          = COALESCE(@LatestCclContentId,         target.LatestCclContentId),
                LatestVersion               = COALESCE(@LatestVersion,              target.LatestVersion),
                LatestStatus                = COALESCE(@LatestStatus,               target.LatestStatus),
                AiTraceId                   = COALESCE(@AiTraceId,                  target.AiTraceId),
                Model                       = COALESCE(@Model,                      target.Model),
                PromptVersion               = COALESCE(@PromptVersion,              target.PromptVersion),
                TemplateVersion             = COALESCE(@TemplateVersion,            target.TemplateVersion),
                Confidence                  = COALESCE(@Confidence,                 target.Confidence),
                GeneratedFieldCount         = COALESCE(@GeneratedFieldCount,        target.GeneratedFieldCount),
                OverrideCount               = target.OverrideCount + @OverrideIncrement,
                LastOverrideAt              = CASE WHEN @OverrideIncrement = 1 THEN SYSDATETIME() ELSE target.LastOverrideAt END,
                LastOverrideReplacedVersion = CASE WHEN @OverrideIncrement = 1 THEN @LastOverrideReplacedVersion ELSE target.LastOverrideReplacedVersion END,
                UpdatedBy                   = COALESCE(@UpdatedBy,                  target.UpdatedBy),
                UpdatedAt                   = SYSDATETIME()
            WHEN NOT MATCHED THEN INSERT (
                MatterId, DraftJson,
                LatestCclContentId, LatestVersion, LatestStatus,
                AiTraceId, Model, PromptVersion, TemplateVersion, Confidence,
                GeneratedFieldCount, OverrideCount, LastOverrideAt,
                LastOverrideReplacedVersion, UpdatedBy
            ) VALUES (
                @MatterId, @DraftJson,
                @LatestCclContentId, @LatestVersion, @LatestStatus,
                @AiTraceId, @Model, @PromptVersion, @TemplateVersion, @Confidence,
                @GeneratedFieldCount, @OverrideIncrement,
                CASE WHEN @OverrideIncrement = 1 THEN SYSDATETIME() ELSE NULL END,
                @LastOverrideReplacedVersion, @UpdatedBy
            );`);
}

async function fetchDraftFromDb(matterId) {
    const record = await fetchDraftRecordFromDb(matterId);
    return record ? record.json : null;
}

/**
 * Returns the full CclDrafts row in the form { json, meta } or null.
 * `meta` is null when the table is in legacy v1 shape.
 */
async function fetchDraftRecordFromDb(matterId) {
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.warn('[ccl] INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
        return null;
    }
    const pool = await getPool(connectionString);
    const shape = await ensureCclDraftsTable(pool);
    if (shape === 'missing') return null;

    if (shape === 'v1') {
        const result = await pool.request()
            .input('MatterId', sql.NVarChar(50), matterId)
            .query('SELECT DraftJson, CreatedAt, UpdatedAt FROM dbo.CclDrafts WHERE MatterId = @MatterId');
        const row = result.recordset[0];
        if (!row) return null;
        return { json: JSON.parse(row.DraftJson), meta: null, raw: row };
    }

    const result = await pool.request()
        .input('MatterId', sql.NVarChar(50), matterId)
        .query(`SELECT MatterId, DraftJson,
                       LatestCclContentId, LatestVersion, LatestStatus,
                       AiTraceId, Model, PromptVersion, TemplateVersion, Confidence,
                       GeneratedFieldCount, OverrideCount,
                       LastOverrideAt, LastOverrideReplacedVersion,
                       UpdatedBy, CreatedAt, UpdatedAt
                FROM dbo.CclDrafts WHERE MatterId = @MatterId`);
    const row = result.recordset[0];
    if (!row) return null;
    let json = null;
    try { json = JSON.parse(row.DraftJson); } catch { json = null; }
    const meta = {
        latestCclContentId: row.LatestCclContentId ?? null,
        latestVersion: row.LatestVersion ?? null,
        latestStatus: row.LatestStatus ?? null,
        aiTraceId: row.AiTraceId ?? null,
        model: row.Model ?? null,
        promptVersion: row.PromptVersion ?? null,
        templateVersion: row.TemplateVersion ?? null,
        confidence: row.Confidence ?? null,
        generatedFieldCount: row.GeneratedFieldCount ?? null,
        overrideCount: row.OverrideCount ?? 0,
        lastOverrideAt: row.LastOverrideAt ?? null,
        lastOverrideReplacedVersion: row.LastOverrideReplacedVersion ?? null,
        updatedBy: row.UpdatedBy ?? null,
        createdAt: row.CreatedAt ?? null,
        updatedAt: row.UpdatedAt ?? null,
    };
    return { json, meta, raw: row };
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

function mergeDraftWithAiFields(baseDraft = {}, aiFields = {}, options = {}) {
    const overrideMode = options?.overrideMode === 'replace-ai-fields';
    const merged = { ...baseDraft };
    for (const [key, value] of Object.entries(aiFields || {})) {
        const current = String(merged[key] || '').trim();
        const isPlaceholder = /^\{\{.*\}\}$/.test(current);
        if (overrideMode || !current || current.length < 5 || isPlaceholder) {
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
    const contextPackage = preview._contextPackage;
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
        _contextPackage: contextPackage,
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

function deriveServiceStatus({ latestContent, fieldSummary, matterCclDate, latestTrace, latestCompileTrace = null, latestSent = null }) {
    const status = String(latestContent?.Status || '').toLowerCase();
    const sentChannel = String(latestSent?.Channel || '').trim().toLowerCase();
    const confidence = normalizeTraceConfidence(latestTrace?.Confidence || latestTrace?.confidence);
    const latestContentAt = Math.max(toTimestamp(latestContent?.CreatedAt), toTimestamp(latestContent?.UpdatedAt));
    const latestCompileAt = Math.max(toTimestamp(latestCompileTrace?.CreatedAt), toTimestamp(latestCompileTrace?.createdAt));

    let key = 'pending';
    let label = 'Pending';
    let tone = 'neutral';

    if (latestSent?.SentAt || status === 'sent' || status === 'uploaded' || matterCclDate) {
        key = 'sent';
        label = sentChannel === 'internal-guarded' ? 'Sent internal' : 'Sent';
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
    aiMeta = null,
}) {
    const merged = await mergeMatterFields(matterId, draftJson);

    let cclContentId = null;
    let cclContentVersion = null;
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
        if (cclContentId) {
            try {
                const latest = await getLatestCclContent(matterId);
                if (latest && latest.CclContentId === cclContentId) cclContentVersion = latest.Version || null;
            } catch { /* non-fatal */ }
        }
    } catch (err) {
        console.warn('[ccl] CclContent save failed (non-blocking):', err.message);
    }

    const draftMeta = {
        latestCclContentId: cclContentId,
        latestVersion: cclContentVersion,
        latestStatus: 'draft',
        aiTraceId: aiTraceId || (aiMeta && aiMeta.aiTraceId) || null,
        model: aiMeta && aiMeta.model || null,
        promptVersion: aiMeta && aiMeta.promptVersion || null,
        templateVersion,
        confidence: aiMeta && aiMeta.confidence || null,
        generatedFieldCount: aiMeta && aiMeta.generatedFieldCount || null,
        updatedBy: user,
        overrideMode: aiMeta && aiMeta.overrideMode || 'preserve-existing',
        replacedVersion: aiMeta && aiMeta.replacedVersion || null,
    };
    try { await saveDraftToDb(matterId, merged, draftMeta); } catch (dbErr) { console.warn('[ccl] Draft DB save failed (non-blocking):', dbErr.message); }
    saveDraftToFileCache(matterId, merged);

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

function parseJsonObject(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function extractComparableDraftFields(value) {
    if (!value || typeof value !== 'object') return {};
    const comparable = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!key || key.startsWith('_')) continue;
        if (raw && typeof raw === 'object') continue;
        if (raw == null) {
            comparable[key] = '';
            continue;
        }
        if (typeof raw === 'number' || typeof raw === 'boolean') {
            comparable[key] = String(raw).trim();
            continue;
        }
        if (typeof raw === 'string') {
            comparable[key] = raw.trim();
        }
    }
    return comparable;
}

function getFlaggedFieldKeys(latestContent) {
    const pressureTest = parseJsonObject(latestContent?.PressureTestJson);
    if (!pressureTest || typeof pressureTest !== 'object') return new Set();
    const flagged = new Set();
    for (const [key, value] of Object.entries(pressureTest)) {
        if (value && typeof value === 'object' && value.flag) {
            flagged.add(key);
        }
    }
    return flagged;
}

function getAiBaselineFields(draftJson, latestContent) {
    const incomingProvenance = parseJsonObject(draftJson?._provenance);
    const latestProvenance = parseJsonObject(latestContent?.ProvenanceJson);
    const incomingAiFields = incomingProvenance?.ai?.generatedFields;
    if (incomingAiFields && typeof incomingAiFields === 'object') {
        return extractComparableDraftFields(incomingAiFields);
    }
    const latestAiFields = latestProvenance?.ai?.generatedFields;
    if (latestAiFields && typeof latestAiFields === 'object') {
        return extractComparableDraftFields(latestAiFields);
    }
    return extractComparableDraftFields(parseJsonObject(latestContent?.FieldsJson));
}

function buildFieldEditRows({ aiBaselineFields, previousFields, nextFields, flaggedFieldKeys }) {
    const edits = [];
    const keys = new Set([
        ...Object.keys(previousFields || {}),
        ...Object.keys(nextFields || {}),
    ]);

    for (const key of keys) {
        if (!key) continue;
        const previousValue = String(previousFields?.[key] || '').trim();
        const nextValue = String(nextFields?.[key] || '').trim();
        if (previousValue === nextValue) continue;

        const aiValue = String(
            Object.prototype.hasOwnProperty.call(aiBaselineFields || {}, key)
                ? aiBaselineFields[key]
                : previousValue
        ).trim();

        let editType = 'rewritten';
        if (!nextValue) {
            editType = 'cleared';
        } else if (aiValue && nextValue === aiValue) {
            editType = 'accepted';
        } else if (flaggedFieldKeys?.has(key)) {
            editType = 'safety-net-override';
        }

        edits.push({
            fieldKey: key,
            aiValue,
            finalValue: nextValue,
            editType,
        });
    }

    return edits;
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
        let latestContent = null;
        try {
            latestContent = await getLatestCclContent(matterId);
        } catch (latestErr) {
            console.warn('[ccl] Could not read latest CclContent before diffing edits:', latestErr.message);
            trackException(latestErr, { operation: 'CCL.Save.ReadLatestBeforeDiff', matterId: String(matterId), user });
        }

        const aiBaselineFields = getAiBaselineFields(draftJson, latestContent);
        const previousFields = extractComparableDraftFields(parseJsonObject(latestContent?.FieldsJson));
        const nextFields = extractComparableDraftFields(draftJson);
        const flaggedFieldKeys = getFlaggedFieldKeys(latestContent);

        const result = await persistCclSnapshot({
            matterId,
            draftJson,
            user,
            provenanceJson: draftJson._provenance || null,
        });

        const fieldEditRows = buildFieldEditRows({
            aiBaselineFields,
            previousFields,
            nextFields,
            flaggedFieldKeys,
        });
        if (result.cclContentId && fieldEditRows.length > 0) {
            const provenance = parseJsonObject(draftJson._provenance);
            try {
                await saveCclFieldEdits({
                    cclContentId: result.cclContentId,
                    matterId,
                    changedBy: user,
                    promptVersion: provenance?.promptVersion || provenance?.ai?.promptVersion || '',
                    templateVersion: provenance?.templateVersion || '',
                    edits: fieldEditRows,
                });
            } catch (editErr) {
                console.warn('[ccl] CclFieldEdits save failed (non-blocking):', editErr.message);
                trackException(editErr, { operation: 'CCL.Save.RecordFieldEdits', matterId: String(matterId), user });
                trackEvent('CCL.FieldEdit.RecordingFailed', {
                    matterId: String(matterId),
                    user,
                    attemptedRows: String(fieldEditRows.length),
                    error: editErr.message,
                });
            }
        }

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
        matterDisplayNumber,
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
        overrideMode = 'preserve-existing',
        baseVersion = null,
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
        }, user, { preBuiltContextPackage: compile._contextPackage });

        const mergedDraft = mergeDraftWithAiFields(draftJson, aiResult.fields || {}, { overrideMode });
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
                generatedFields: aiResult.fields || {},
                fallbackReason: aiResult.fallbackReason || null,
                trackingId: aiResult.debug?.trackingId || null,
                aiTraceId: aiResult.aiTraceId || null,
                overrideMode,
                replacedVersion: typeof baseVersion === 'number' ? baseVersion : null,
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
            aiMeta: {
                aiTraceId: aiResult.aiTraceId || null,
                model: aiResult.model || aiResult.deployment || null,
                promptVersion: aiResult.promptVersion || CCL_PROMPT_VERSION,
                confidence: aiResult.confidence || null,
                generatedFieldCount: Number(aiResult.debug?.generatedFieldCount)
                    || (aiResult.fields ? Object.keys(aiResult.fields).length : null),
                overrideMode,
                replacedVersion: typeof baseVersion === 'number' ? baseVersion : null,
            },
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
            }).then(async (ptResult) => {
                // HOME_TODO_SINGLE_PICKUP_SURFACE — B2 wiring for review-ccl.
                // 2026-04-24: always emit the todo (flagged OR clean). Since ND
                // upload is now gated behind explicit solicitor approval, the
                // clean-draft path also needs an entry point — otherwise a
                // solicitor who closes the matter-opening completion screen
                // without clicking "Review & send CCL" has no way back in.
                // Best-effort; never throws (hubTodoLog + teamLookup are resilient).
                try {
                    const flaggedCount = Number(ptResult?.flaggedCount || 0);
                    const feeEarnerEmail = preview?.contextFields?.feeEarnerEmail || '';
                    let ownerInitials = null;
                    if (feeEarnerEmail) {
                        try {
                            const { getTeamInitialsByEmail } = require('../utils/teamLookup');
                            ownerInitials = await getTeamInitialsByEmail(feeEarnerEmail);
                        } catch { /* best-effort */ }
                    }
                    if (ownerInitials) {
                        const { createCard } = require('../utils/hubTodoLog');
                        const matterRef = matterDisplayNumber || String(matterId || '');
                        const hasFlags = flaggedCount > 0;
                        await createCard({
                            kind: 'review-ccl',
                            ownerInitials,
                            matterRef,
                            docType: 'Client Care Letter',
                            stage: 'review',
                            summary: hasFlags
                                ? `Review CCL · ${matterRef}`
                                : `Approve CCL upload · ${matterRef}`,
                            lastEvent: hasFlags
                                ? `PT complete · ${flaggedCount} flagged`
                                : 'PT clean · ready to send',
                            payload: {
                                matterId: String(matterId),
                                matterDisplayNumber: matterDisplayNumber || null,
                                instructionRef: instructionRef || null,
                                flaggedCount,
                                ptTrackingId: ptResult?.trackingId || null,
                                awaitingNdApproval: true,
                            },
                        });
                    }
                } catch (todoErr) {
                    trackEvent('Todo.Card.Created.Failed', {
                        kind: 'review-ccl',
                        matterId: String(matterId),
                        error: todoErr?.message || String(todoErr),
                    });
                }
            }).catch(err => {
                console.warn(`[ccl] Background PT failed for ${matterId}:`, err.message);
                trackEvent('CCL.PressureTest.BackgroundFailed', { matterId: String(matterId), error: err.message, triggeredBy: user });
            });
        }

        // Background autopilot chain — Teams notification → rollup telemetry.
        // 2026-04-24: ND upload removed from silent chain. Nothing goes to NetDocuments
        // without explicit solicitor approval. Solicitors approve from either
        //   (a) MatterOpenedHandoff "Review & send CCL" at the end of matter opening, or
        //   (b) the Home `review-ccl` hub_todo (always emitted — flagged or clean).
        // Both converge on the same review rail (`openHomeCclReview` CustomEvent) which
        // posts to /api/ccl-ops/upload-nd. The CCL_AUTO_UPLOAD_ND env flag is preserved
        // as a read-only deprecation log so staging/prod can't silently re-enable it.
        const autoUploadEnabled = false;
        if (String(process.env.CCL_AUTO_UPLOAD_ND || '').trim() === '1') {
            trackEvent('CCL.NdUpload.Skipped.AwaitingApproval', {
                matterId: String(matterId),
                reason: 'flag-deprecated',
                note: 'CCL_AUTO_UPLOAD_ND is a no-op since 2026-04-24; upload requires solicitor click.',
                triggeredBy: user || 'auto-post-generate',
            });
        }
        const autoNotifyEnabled = String(process.env.CCL_AUTO_NOTIFY_FEE_EARNER || '').trim() === '1';
        const chainGatedEligible = result.unresolvedCount === 0;
        const chainStartMs = Date.now();
        trackEvent('CCL.AutopilotChain.Started', {
            matterId: String(matterId),
            triggeredBy: user || 'auto-post-generate',
            uploadEnabled: String(autoUploadEnabled),
            notifyEnabled: String(autoNotifyEnabled),
            eligible: String(chainGatedEligible),
            unresolvedCount: String(result.unresolvedCount),
            confidence: String(aiResult.confidence || ''),
        });

        setImmediate(async () => {
            // Stage: persist — already succeeded (we got here). Tagged for the rollup.
            let persistStage = 'succeeded';

            // Stage: ND upload — DISABLED in the silent chain (2026-04-24).
            // Solicitor approval is required; see notes above.
            const ndStage = 'awaiting-approval';
            const ndReason = chainGatedEligible ? 'requires-solicitor-click' : 'unresolved-placeholders';
            const ndDocumentId = null;

            // Stage: Teams notification
            let notifyStage = 'skipped';
            let notifyReason = autoNotifyEnabled ? (chainGatedEligible ? '' : 'unresolved-placeholders') : 'flag-disabled';
            if (autoNotifyEnabled && chainGatedEligible) {
                try {
                    const { notifyCclReady } = require('../utils/cclNotifications');
                    const notifyResult = await notifyCclReady({
                        matterId,
                        matterDisplayNumber,
                        clientName: result.merged.insert_clients_name || clientName || '',
                        feeEarner: result.merged.name_of_person_handling_matter || handlerName || '',
                        feeEarnerEmail: result.merged.fee_earner_email || preview?.contextFields?.feeEarnerEmail || '',
                        practiceArea: result.merged.team_assignments?.practice_area || practiceArea || '',
                        confidence: aiResult.confidence || '',
                        fieldCount: result.fieldCount,
                        unresolvedCount: result.unresolvedCount,
                        ndDocumentId,
                        triggeredBy: user || 'auto-post-generate',
                    });
                    if (notifyResult && notifyResult.sent) {
                        notifyStage = 'succeeded';
                        notifyReason = '';
                    } else if (notifyResult && notifyResult.skipped) {
                        notifyStage = 'skipped';
                        notifyReason = notifyResult.skipped;
                    } else {
                        notifyStage = 'failed';
                        notifyReason = (notifyResult && notifyResult.error) || 'unknown-failure';
                    }
                } catch (err) {
                    notifyStage = 'failed';
                    notifyReason = err.message || 'throw';
                    console.warn(`[ccl] CCL Teams notification failed for ${matterId}:`, err.message);
                }
            }

            // Rollup — single event summarising the whole chain. KQL-friendly: stage
            // outcomes are tagged so the runbook can compute success rates per stage
            // and end-to-end chain completion (persist + nd=succeeded|skipped + notify=succeeded|skipped).
            const chainDurationMs = Date.now() - chainStartMs;
            const allGreen = persistStage === 'succeeded'
                && (ndStage === 'succeeded' || ndStage === 'skipped')
                && (notifyStage === 'succeeded' || notifyStage === 'skipped');
            trackEvent('CCL.AutopilotChain.Completed', {
                matterId: String(matterId),
                triggeredBy: user || 'auto-post-generate',
                persistStage,
                ndStage,
                ndReason,
                ndDocumentId: ndDocumentId ? String(ndDocumentId) : '',
                notifyStage,
                notifyReason,
                allGreen: String(allGreen),
                chainDurationMs: String(chainDurationMs),
                confidence: String(aiResult.confidence || ''),
                unresolvedCount: String(result.unresolvedCount),
            });
            trackMetric('CCL.AutopilotChain.Duration', chainDurationMs, { matterId: String(matterId) });

            // Activity feed entry — one row per chain so the Operations feed in
            // the Activity tab reflects every autopilot run (not just Teams DMs).
            try {
                const { append: opAppend } = require('../utils/opLog');
                const chainStatus = (ndStage === 'failed' || notifyStage === 'failed') ? 'error' : 'success';
                const summaryParts = [];
                if (matterDisplayNumber) summaryParts.push(String(matterDisplayNumber));
                summaryParts.push(`ND: ${ndStage}${ndStage === 'failed' && ndReason ? ` (${ndReason})` : ''}`);
                summaryParts.push(`Notify: ${notifyStage}${notifyStage === 'failed' && notifyReason ? ` (${notifyReason})` : ''}`);
                summaryParts.push(`${chainDurationMs}ms`);
                opAppend({
                    type: 'activity.ccl.autopilot',
                    status: chainStatus,
                    matterId: String(matterId),
                    matterDisplayNumber: matterDisplayNumber || null,
                    triggeredBy: user || 'auto-post-generate',
                    persistStage,
                    ndStage,
                    ndReason: ndReason || null,
                    ndDocumentId: ndDocumentId ? String(ndDocumentId) : null,
                    notifyStage,
                    notifyReason: notifyReason || null,
                    allGreen,
                    chainDurationMs,
                    confidence: String(aiResult.confidence || ''),
                    summary: summaryParts.join(' · '),
                });
            } catch (appendErr) {
                // opLog is best-effort; never let a feed write break the chain
                console.warn('[ccl] activity-feed append failed:', appendErr.message);
            }
        });

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

        const { _contextPackage: _cp, ...safeCompile } = compile;
        if (safeCompile.preview) { const { _contextPackage: _cp2, ...safePreview } = safeCompile.preview; safeCompile.preview = safePreview; }
        const { _contextPackage: _cp3, ...safePreview2 } = preview;
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
            preview: safePreview2,
            compile: safeCompile,
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
        const { _contextPackage: _cp, ...safeCompile } = compile;
        if (safeCompile.preview) { const { _contextPackage: _cp2, ...safePreview } = safeCompile.preview; safeCompile.preview = safePreview; }
        return res.json({ ok: true, matterId, compile: safeCompile });
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
        const latestSent = await getLatestCclSentForMatter(matterId).catch(() => null);
        const serviceStatus = deriveServiceStatus({ latestContent, fieldSummary, matterCclDate: cclDate, latestTrace, latestCompileTrace, latestSent });
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
                sentAt: latestSent?.SentAt || null,
                sentBy: latestSent?.SentBy || null,
                sentChannel: latestSent?.Channel || null,
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
        // Fire-and-forget DM notification
        const { notify } = require('../utils/hubNotifier');
        notify('ccl.approved', {
          matterId: String(matterId),
          approvedBy: user,
        });

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
    try {
        const pool = await getPool(connectionString);
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
        const latestSentByMatter = await getLatestCclSentByMatterIds(ids).catch(() => ({}));
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
                latestSent: latestSentByMatter[String(row.MatterId)] || null,
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
                sentAt: latestSentByMatter[String(row.MatterId)]?.SentAt || null,
                sentBy: latestSentByMatter[String(row.MatterId)]?.SentBy || null,
                sentChannel: latestSentByMatter[String(row.MatterId)]?.Channel || null,
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

// Resolves the inner promise OR rejects with a timeout error after `ms` ms.
// Used to guarantee the GET /:matterId handler always responds, even if the
// SQL pool is contended (e.g. boot-time Clio sync overlap).
const cclLoadWithTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
]);

router.get('/:matterId', async (req, res) => {
    const { matterId } = req.params;
    const startedAt = Date.now();
    let responded = false;
    // Hard server-side guard — if anything below stalls, send a graceful 504
    // so the client AbortController never fires "signal is aborted without reason".
    const hardTimeout = setTimeout(() => {
        if (responded) return;
        responded = true;
        const ms = Date.now() - startedAt;
        console.warn(`[ccl] GET /:matterId hard timeout after ${ms}ms for ${matterId}`);
        trackEvent('CCL.Load.Timeout', { matterId: String(matterId), durationMs: String(ms) });
        if (!res.headersSent) {
            res.status(504).json({ ok: false, exists: false, error: 'CCL load timed out — please retry.' });
        }
    }, 9000);

    const fp = filePath(matterId);
    const exists = fs.existsSync(fp);
    let json;
    let source = 'none';
    let latestContent = null;
    let history = [];
    let draftRecord = null;
    try {
        // Per-query timeout: 6s each. Failures fall through to file/JSON fallbacks.
        [latestContent, history] = await Promise.all([
            cclLoadWithTimeout(getLatestCclContent(matterId), 6000, 'getLatestCclContent').catch((err) => {
                console.warn(`[ccl] getLatestCclContent failed for ${matterId}: ${err.message}`);
                return null;
            }),
            cclLoadWithTimeout(getCclContentHistory(matterId), 6000, 'getCclContentHistory').catch((err) => {
                console.warn(`[ccl] getCclContentHistory failed for ${matterId}: ${err.message}`);
                return [];
            }),
        ]);
        draftRecord = await cclLoadWithTimeout(fetchDraftRecordFromDb(matterId), 6000, 'fetchDraftRecordFromDb').catch((err) => {
            console.warn(`[ccl] fetchDraftRecordFromDb failed for ${matterId}: ${err.message}`);
            return null;
        });
        json = draftRecord?.json || null;
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
    } catch (err) {
        console.warn(`[ccl] GET /:matterId inner error for ${matterId}: ${err.message}`);
        trackException(err, { operation: 'CCL.Load', matterId: String(matterId) });
    }
    trackEvent('CCL.Load', {
        matterId: String(matterId), exists: String(exists), source,
        hasDraft: String(!!json), durationMs: String(Date.now() - startedAt),
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

    if (responded) {
        clearTimeout(hardTimeout);
        return; // hard timeout already responded; bail out so we don't double-send
    }
    responded = true;
    clearTimeout(hardTimeout);
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
            // Enriched provenance from CclDrafts v2 (null when table is in v1 shape).
            draftMeta: draftRecord?.meta || null,
        },
    });
});

// ─── GET /api/ccl/:matterId/rerun-preview ─────────────────────────────────
// Lightweight payload for the override-rerun confirmation modal:
// returns { current, projected } so the UI can render an above/below comparison
// without hitting multiple endpoints.
router.get('/:matterId/rerun-preview', async (req, res) => {
    const { matterId } = req.params;
    try {
        const [draftRecord, latestContent] = await Promise.all([
            fetchDraftRecordFromDb(matterId).catch(() => null),
            getLatestCclContent(matterId).catch(() => null),
        ]);

        const meta = draftRecord?.meta || null;
        const currentVersion = latestContent?.Version || meta?.latestVersion || null;
        const nextVersion = currentVersion ? currentVersion + 1 : null;
        const projectedModel = require('../utils/aiClient').DEPLOYMENT || meta?.model || null;

        const current = {
            version: currentVersion,
            cclContentId: latestContent?.CclContentId || meta?.latestCclContentId || null,
            status: latestContent?.Status || meta?.latestStatus || null,
            model: meta?.model || null,
            promptVersion: meta?.promptVersion || null,
            templateVersion: meta?.templateVersion || latestContent?.TemplateVersion || null,
            confidence: meta?.confidence || null,
            generatedFieldCount: meta?.generatedFieldCount ?? null,
            aiTraceId: meta?.aiTraceId || latestContent?.AiTraceId || null,
            updatedAt: meta?.updatedAt || latestContent?.CreatedAt || null,
            updatedBy: meta?.updatedBy || latestContent?.CreatedBy || null,
            pressureTest: latestContent?.PressureTestJson ? {
                flaggedCount: latestContent.PressureTestFlaggedCount ?? null,
                completedAt: latestContent.PressureTestAt || null,
            } : null,
            overrideHistory: {
                overrideCount: meta?.overrideCount ?? 0,
                lastOverrideAt: meta?.lastOverrideAt || null,
                lastOverrideReplacedVersion: meta?.lastOverrideReplacedVersion || null,
            },
        };

        const projected = {
            version: nextVersion,
            model: projectedModel,
            promptVersion: CCL_PROMPT_VERSION,
            templateVersion: CCL_TEMPLATE_VERSION,
            overrideMode: 'replace-ai-fields',
            note: 'A new pressure test runs automatically after the rerun.',
        };

        res.json({ ok: true, matterId, current, projected, schemaShape: meta ? 'v2' : 'v1' });
    } catch (err) {
        console.warn(`[ccl] rerun-preview failed for ${matterId}: ${err.message}`);
        trackException(err, { operation: 'CCL.RerunPreview', matterId: String(matterId) });
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = { router, CCL_DIR, compileCclContext, persistCclSnapshot };
