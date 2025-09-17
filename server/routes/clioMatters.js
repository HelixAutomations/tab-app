const express = require('express');
const { getSecret } = require('../utils/getSecret');
const fs = require('fs');
const path = require('path');
const teamLookup = require('../utils/teamLookup');
const createOrUpdate = require('../utils/createOrUpdate');

const { PRACTICE_AREAS } = require('../utils/clioConstants');

// Hard-coded picklist option mappings
const ND_OPTIONS = {
    "Adjudication": 187069,
    "Residential Possession": 187072,
    "Employment": 187075,
    "Default": 187078
};
const VALUE_OPTIONS = {
    "Less than £10k": 244802,
    "£10k - £500k": 244805,
    "£501k - £1m": 244808,
    "£1m - £5m": 244811,
    "£5m - £20m": 244814,
    "Over £20m": 244817
};


let riskData = [];
const riskPath = path.join(__dirname, '..', '..', 'src', 'localData', 'localRiskAssessments.json');
if (fs.existsSync(riskPath)) {
    try {
        riskData = JSON.parse(fs.readFileSync(riskPath, 'utf-8'));
    } catch (err) {
        console.warn('Invalid risk data JSON:', err);
    }
}

function getRiskResult(ref) {
    if (!ref) return null;
    const entry = riskData.find(r => (r.InstructionRef || '').toLowerCase() === ref.toLowerCase());
    return entry ? entry.RiskAssessmentResult : null;
}

function mapPerson(client, instructionRef) {
    const address = client.address || {};
    const verification = client.verification || {};
    const checkResult = verification.check_result || client.check_result;
    const idType = checkResult === 'DriversLicense' ? 142570 : 142567;
    const tillerId =
        verification.check_id || client.check_id || client.EIDCheckId || client.checkId || null;
    const expiry =
        verification.check_expiry ||
        client.check_expiry ||
        client.CheckExpiry ||
        client.checkExpiry;

    const phone =
        client.best_number ||
        client.phone ||
        client.phone_number ||
        client.phoneNumber ||
        client.Phone ||
        null;

    return {
        type: 'Person',
        first_name: client.first_name || client.first || '',
        last_name: client.last_name || client.last || '',
        prefix: client.prefix || null,
        date_of_birth: client.date_of_birth || null,
        email_addresses: [
            {
                name: 'Home',
                address: client.email || client.Email || '',
                default_email: true
            }
        ],
        phone_numbers: phone ? [{ name: 'Home', number: phone, default_number: true }] : [],
        addresses: [
            {
                name: 'Home',
                street: `${address.house_number || ''} ${address.street || ''}`.trim(),
                city: address.city || '',
                province: address.county || '',
                postal_code: address.post_code || '',
                country: address.country || ''
            }
        ],
        company: {
            name: client.company_details?.name || null
        },
        custom_field_values: (() => {
            const cfs = [];
            if (instructionRef) {
                cfs.push({ value: instructionRef, custom_field: { id: 380728 } });
            }
            if (expiry) {
                cfs.push({ value: expiry, custom_field: { id: 235702 } });
            }
            cfs.push({ value: idType, custom_field: { id: 235699 } });
            if (tillerId) {
                cfs.push({ value: tillerId, custom_field: { id: 286228 } });
            }
            return cfs;
        })()
    };
}

const router = express.Router();
router.post('/', async (req, res) => {
    const { formData, initials } = req.body || {};
    if (!formData || !initials) return res.status(400).json({ error: 'Missing data' });
    try {
        // 1. Refresh token (normalize initials to lower-case to match secret naming convention)
        const lower = String(initials || '').toLowerCase();
        const cid = await getSecret(`${lower}-clio-v1-clientid`);
        const cs = await getSecret(`${lower}-clio-v1-clientsecret`);
        const rt = await getSecret(`${lower}-clio-v1-refreshtoken`);
        const tv = `https://eu.app.clio.com/oauth/token?client_id=${cid}&client_secret=${cs}&grant_type=refresh_token&refresh_token=${rt}`;
        const tr = await fetch(tv, { method: 'POST' });
        if (!tr.ok) throw new Error(await tr.text());
        const { access_token } = await tr.json();
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

        // 2. Extract matter data
        const md = formData.matter_details;
        const { instruction_ref, description, date_created, client_type, practice_area, folder_structure, dispute_value } = md;

        // 3. Build custom fields
        const cf = [
            { value: formData.team_assignments.supervising_partner, custom_field: { id: 232574 } },
            ND_OPTIONS[folder_structure] && { value: ND_OPTIONS[folder_structure], custom_field: { id: 299746 } },
            VALUE_OPTIONS[dispute_value] && { value: VALUE_OPTIONS[dispute_value], custom_field: { id: 378566 } },
            { value: instruction_ref, custom_field: { id: 380722 } }
        ].filter(Boolean);

        // 4. Upsert client contact
        const first = formData.client_information[0];
        if (!first) {
            throw new Error('Missing client details for contact');
        }
        const contactPayload = mapPerson(first, instruction_ref);
        const contactResult = await createOrUpdate(contactPayload, headers);
        const pid = contactResult.data.id;

        // 5. Build matter payload
        const responsibleId = await teamLookup.getClioId(initials);
        const originatingInitials = formData.team_assignments.originating_solicitor_initials;
        const originatingId  = await teamLookup.getClioId(originatingInitials);

        if (!responsibleId) {
            console.error(`No Clio ID for ${initials}`);
            throw new Error('No Clio ID for ' + initials);
        }
        if (!originatingId) {
            console.error(`No Clio ID for ${originatingInitials}`);
            throw new Error('No Clio ID for ' + originatingInitials);
        }
        const payload = {
            data: {
                billable: true,
                client: { id: pid },
                client_reference: instruction_ref,
                description,
                practice_area: { id: PRACTICE_AREAS[practice_area] },
                responsible_attorney: { id: responsibleId },
                originating_attorney: { id: originatingId },
                status: 'Open',
                risk_result: getRiskResult(instruction_ref),
                custom_field_values: cf
            }
        };
        console.error('Matter payload →', JSON.stringify(payload, null, 2));

        // 6. Create matter
                const mr = await fetch('https://eu.app.clio.com/api/v4/matters.json', { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!mr.ok) throw new Error(await mr.text());
        const matter = (await mr.json()).data;

                // Attempt to send a confirmation email (non-blocking failure)
                try {
                        const mdSafe = formData?.matter_details || {};
                        const client = formData?.client_information?.[0] || {};
                        const instructionRef = mdSafe.instruction_ref || '';
                        const pa = mdSafe.practice_area || '';
                        const desc = mdSafe.description || '';
                        const clientName = [client.first_name || client.first, client.last_name || client.last]
                                .filter(Boolean)
                                .join(' ') || client.email || 'Client';

                        const subject = `Matter Opened: ${instructionRef || matter.client_reference || matter.id}`;
                        const bodyHtml = `
                                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden;">
                                    <div style="background: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%); border-bottom: 1px solid #e5e7eb; padding: 18px 22px;">
                                        <h2 style="margin: 0; font-size: 18px; color: #0f172a;">Matter Opened</h2>
                                        <div style="margin-top: 4px; color: #334155; font-size: 12px;">${new Date().toLocaleString('en-GB')}</div>
                                    </div>
                                    <div style="padding: 18px 22px;">
                                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                                            <div style="font-size: 12px; color: #475569;">Instruction Ref</div>
                                            <div style="font-weight: 600; color: #0f172a; font-size: 14px;">${instructionRef || '-'}</div>
                                        </div>
                                        <table style="width:100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 12px; color: #475569; width: 160px;">Matter ID</td>
                                                <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${matter.id}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 12px; color: #475569;">Client</td>
                                                <td style="padding: 8px 0; color: #0f172a;">${clientName}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 12px; color: #475569;">Practice Area</td>
                                                <td style="padding: 8px 0; color: #0f172a;">${pa || '-'}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 12px; color: #475569;">Description</td>
                                                <td style="padding: 8px 0; color: #0f172a;">${desc || '-'}</td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>
                        `;

                        const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
                        const emailPayload = {
                                user_email: 'lz@helix-law.com', // test recipient for verification
                                subject,
                                email_contents: bodyHtml,
                                from_email: 'automations@helix-law.com',
                                // Safety BCCs (kept minimal for test; expand after approval)
                                bcc_emails: ''
                        };

                        // Fire the email; do not block overall success if this fails
                        const emailResp = await fetch(`${base}/api/sendEmail`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(emailPayload)
                        });
                        if (!emailResp.ok) {
                                const t = await emailResp.text();
                                console.warn('Matter-open confirmation email failed:', emailResp.status, t);
                        }
                } catch (emailErr) {
                        console.warn('Email dispatch error (non-blocking):', emailErr?.message || emailErr);
                }

                res.json({ ok: true, matter });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;
