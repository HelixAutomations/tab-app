const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const { getSecret } = require('../utils/getSecret');
const {
    tokens: cclTokens
} = require(path.join(process.cwd(), 'src', 'app', 'functionality', 'cclSchema.js'));
const EXTRA_TOKENS = [
    'and_or_intervals_eg_every_three_months',
    'contact_details_for_marketing_opt_out',
    'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
    'figure_or_range',
    'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees',
    'in_total_including_vat_or_for_the_next_steps_in_your_matter',
    'instructions_link',
    'link_to_preference_centre',
    'may_will'
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
    flat.name_of_person_handling_matter = flat.team_assignments?.fee_earner || '';

    const feeUser = findUserByName(flat.team_assignments?.fee_earner);
    flat.status = feeUser?.Role || '';
    flat.email = feeUser?.Email || '';
    flat.fee_earner_email = feeUser?.Email || '';
    flat.fee_earner_phone = feeUser?.Phone || '';
    flat.fee_earner_postal_address = feeUser?.Address || '';

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

const CCL_DIR = path.join(process.cwd(), 'public', 'ccls');
fs.mkdirSync(CCL_DIR, { recursive: true });

const filePath = (id) => path.join(CCL_DIR, `${id}.docx`);
const jsonPath = (id) => path.join(CCL_DIR, `${id}.json`);

async function saveDraftToDb(matterId, json) {
    const baseUrl =
        process.env.CCL_DRAFT_FUNC_BASE_URL ||
        'https://instructions-vnet-functions.azurewebsites.net/api/recordCclDraft';
    let code = process.env.CCL_DRAFT_FUNC_CODE;
    if (!code) {
        const secretName = process.env.CCL_DRAFT_FUNC_CODE_SECRET || 'recordCclDraft-code';
        code = await getSecret(secretName);
    }
    const url = `${baseUrl}?code=${code}`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterId, draftJson: json })
    });
}

async function fetchDraftFromDb(matterId) {
    const baseUrl =
        process.env.FETCH_CCL_DRAFT_FUNC_BASE_URL ||
        'https://instructions-vnet-functions.azurewebsites.net/api/fetchCclDraft';
    let code = process.env.FETCH_CCL_DRAFT_FUNC_CODE;
    if (!code) {
        const secretName = process.env.FETCH_CCL_DRAFT_FUNC_CODE_SECRET || 'fetchCclDraft-code';
        code = await getSecret(secretName);
    }
    const url = `${baseUrl}?code=${code}&matterId=${encodeURIComponent(matterId)}`;
    const resp = await fetch(url);
    if (resp.ok) {
        const d = await resp.json();
        return d.draftJson || null;
    }
    return null;
}

router.post('/', async (req, res) => {
    const { matterId, draftJson } = req.body || {};
    if (!matterId || typeof draftJson !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    try {
        const merged = await mergeMatterFields(matterId, draftJson);
        await saveDraftToDb(matterId, merged);
        await generateWordFromJson(merged, filePath(matterId));
        fs.writeFileSync(jsonPath(matterId), JSON.stringify(merged, null, 2));
        res.json({ ok: true, url: `/ccls/${matterId}.docx` });
    } catch (err) {
        console.error('CCL generation failed', err);
        res.status(500).json({ error: 'Failed to generate CCL' });
    }
});

router.patch('/:matterId', async (req, res) => {
    const { draftJson } = req.body || {};
    const { matterId } = req.params;
    if (typeof draftJson !== 'object') {
        return res.status(400).json({ error: 'Invalid draftJson' });
    }
    try {
        const merged = await mergeMatterFields(matterId, draftJson);
        await saveDraftToDb(matterId, merged);
        await generateWordFromJson(merged, filePath(matterId));
        fs.writeFileSync(jsonPath(matterId), JSON.stringify(merged, null, 2));
        res.json({ ok: true, url: `/ccls/${matterId}.docx` });
    } catch (err) {
        console.error('CCL regeneration failed', err);
        res.status(500).json({ error: 'Failed to regenerate CCL' });
    }
});

router.get('/:matterId', async (req, res) => {
    const { matterId } = req.params;
    const fp = filePath(matterId);
    const exists = fs.existsSync(fp);
    let json;
    try {
        json = await fetchDraftFromDb(matterId);
        if (!json && fs.existsSync(jsonPath(matterId))) {
            json = JSON.parse(fs.readFileSync(jsonPath(matterId), 'utf-8'));
        }
    } catch { }
    res.json({ ok: true, exists, url: exists ? `/ccls/${matterId}.docx` : undefined, json });
});

module.exports = { router, CCL_DIR };
