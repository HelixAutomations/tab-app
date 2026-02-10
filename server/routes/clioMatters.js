const express = require('express');
const { getSecret } = require('../utils/getSecret');
const fs = require('fs');
const path = require('path');
const teamLookup = require('../utils/teamLookup');
const createOrUpdate = require('../utils/createOrUpdate');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

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

function mapCompany(client, instructionRef) {
    const verification = client.verification || {};
    const phone =
        client.best_number ||
        client.company_details?.phone ||
        client.phone ||
        client.Phone ||
        null;

    const expiry =
        verification.check_expiry ||
        client.check_expiry ||
        client.CheckExpiry ||
        client.checkExpiry;

    const tillerId =
        verification.check_id || client.check_id || client.EIDCheckId || client.checkId || null;

    const checkResult = verification.check_result || client.check_result;
    const idType = checkResult === 'DriversLicense' ? 142570 : 142567;

    const customFieldValues = [];
    if (instructionRef) {
        customFieldValues.push({ value: instructionRef, custom_field: { id: 380728 } });
    }
    if (expiry) {
        customFieldValues.push({ value: expiry, custom_field: { id: 235702 } });
    }
    customFieldValues.push({ value: idType, custom_field: { id: 235699 } });
    if (tillerId) {
        customFieldValues.push({ value: tillerId, custom_field: { id: 286228 } });
    }
    if (client.company_details?.number) {
        customFieldValues.push({ value: client.company_details.number, custom_field: { id: 368788 } });
    }

    return {
        type: 'Company',
        name: client.company_details?.name || null,
        email_addresses: client.email
            ? [{ name: 'Work', address: client.email || client.Email, default_email: true }]
            : [],
        phone_numbers: phone
            ? [{ name: 'Work', number: phone, default_number: true }]
            : [],
        addresses: client.company_details?.address
            ? [
                {
                    name: 'Work',
                    street: `${client.company_details.address.house_number || ''} ${client.company_details.address.street || ''}`.trim(),
                    city: client.company_details.address.city || '',
                    province: client.company_details.address.county || '',
                    postal_code: client.company_details.address.post_code || '',
                    country: client.company_details.address.country || ''
                }
            ]
            : [],
        custom_field_values: customFieldValues
    };
}

const router = express.Router();
router.post('/', async (req, res) => {
    const matterStartTime = Date.now();
    const { formData, initials, contactIds, companyId } = req.body || {};
    const instructionRef = formData?.matter_details?.instruction_ref || 'unknown';
    if (!formData || !initials) {
        trackEvent('MatterOpening.ClioMatter.ValidationFailed', { instructionRef, reason: 'Missing formData or initials' });
        return res.status(400).json({ error: 'Missing data' });
    }
    trackEvent('MatterOpening.ClioMatter.Started', { instructionRef, initials, practiceArea: formData?.matter_details?.practice_area || '', hasContactIds: String(Array.isArray(contactIds) && contactIds.length > 0) });
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
        
        if (!description || description.trim() === '') {
            console.warn(`Description is empty for instruction ${instruction_ref}. This should have been caught by form validation.`);
        }

        // 3. Build custom fields
        const cf = [
            { value: formData.team_assignments.supervising_partner, custom_field: { id: 232574 } },
            ND_OPTIONS[folder_structure] && { value: ND_OPTIONS[folder_structure], custom_field: { id: 299746 } },
            VALUE_OPTIONS[dispute_value] && { value: VALUE_OPTIONS[dispute_value], custom_field: { id: 378566 } },
            { value: instruction_ref, custom_field: { id: 380722 } }
        ].filter(Boolean);

        // 4. Resolve client to link the matter to
        let pid = null;

        // Prefer IDs produced by the previous "Clio Contact Created/Updated" step
        if (Array.isArray(contactIds) && contactIds.length) {
            if (client_type === 'Company' && companyId) {
                pid = companyId;
            } else {
                pid = contactIds[0];
            }
        } else {
            // Fallback: upsert client contact from submitted form data
            const first = formData.client_information?.[0];
            if (!first) {
                throw new Error('Missing client details for contact');
            }

            // Choose the appropriate mapper based on client type
            let contactPayload;
            if (client_type === 'Company') {
                contactPayload = mapCompany(first, instruction_ref);
            } else {
                contactPayload = mapPerson(first, instruction_ref);
            }

            const contactResult = await createOrUpdate(contactPayload, headers);
            pid = contactResult.data.id;
        }

        // 5. Build matter payload
        const responsibleId = await teamLookup.getClioId(initials);
        const originatingInitials = formData.team_assignments.originating_solicitor_initials;
        let originatingId = await teamLookup.getClioId(originatingInitials);

        if (!responsibleId) {
            console.error(`No Clio ID for ${initials}`);
            throw new Error('No Clio ID for ' + initials);
        }
        
        // If originating solicitor not found or empty, use fee earner as fallback
        if (!originatingId) {
            console.warn(`No Clio ID for originating solicitor "${originatingInitials}", using fee earner as fallback`);
            originatingId = responsibleId;
        }
        
        // Find practice area ID with case-insensitive matching
        const practiceAreaId = PRACTICE_AREAS[practice_area] || 
            Object.entries(PRACTICE_AREAS).find(([key]) => 
                key.toLowerCase() === practice_area.toLowerCase()
            )?.[1];
        
        if (!practiceAreaId) {
            console.error(`No practice area ID found for: "${practice_area}"`);
            console.error('Available practice areas:', Object.keys(PRACTICE_AREAS));
            throw new Error(`Invalid practice area: ${practice_area}`);
        }
        
        const payload = {
            data: {
                billable: true,
                client: { id: pid },
                client_reference: instruction_ref,
                description: description || `Matter opened for ${instruction_ref}`,
                practice_area: { id: practiceAreaId },
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
                        const teamSafe = formData?.team_assignments || {};
                        const client = formData?.client_information?.[0] || {};
                        const verification = client.verification || {};
                        const instSummary = formData?.instruction_summary || {};
                        const instructionRef = mdSafe.instruction_ref || '';
                        const pa = mdSafe.practice_area || '';
                        const desc = mdSafe.description || '';
                        const clientTypeLabel = mdSafe.client_type || 'Individual';
                        const feeEarner = teamSafe.fee_earner || initials?.toUpperCase() || '';
                        const supervisingPartner = teamSafe.supervising_partner || '';
                        
                        // Extract verification/compliance data - prefer instruction_summary, fall back to client data
                        const eidCheckId = instSummary.eid_check_id || verification.check_id || client.check_id || '';
                        const eidResult = instSummary.eid_overall_result || verification.check_result || client.check_result || '';
                        const pepResult = instSummary.pep_sanctions_result || verification.pep_sanctions_result || '';
                        const addressResult = instSummary.address_verification_result || verification.address_verification_result || '';
                        
                        // Risk assessment data
                        const riskData = instSummary.risk_assessment || {};
                        const riskResult = riskData.result || '';
                        const riskScore = riskData.score || null;
                        const riskAssessor = riskData.assessor || '';
                        const riskDate = riskData.compliance_date || '';
                        
                        // Payment data
                        const paymentResult = instSummary.payment_result || '';
                        const paymentAmount = instSummary.payment_amount || null;
                        
                        // Document count
                        const documentCount = instSummary.document_count || 0;
                        const documents = instSummary.documents || [];
                        
                        // Helper to format file size
                        const formatFileSize = (bytes) => {
                                if (!bytes) return '';
                                if (bytes < 1024) return `${bytes} B`;
                                if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
                                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                        };
                        
                        // Helper to get file extension from filename
                        const getFileExtension = (filename) => {
                                if (!filename) return '';
                                const parts = filename.split('.');
                                return parts.length > 1 ? parts.pop().toUpperCase() : '';
                        };
                        
                        // Deal info
                        const dealId = instSummary.deal_id || '';
                        
                        // Build client name based on type
                        let clientName;
                        if (clientTypeLabel === 'Company') {
                                clientName = client.company_details?.name || client.email || 'Company';
                        } else {
                                clientName = [client.first_name || client.first, client.last_name || client.last]
                                        .filter(Boolean)
                                        .join(' ') || client.email || 'Client';
                        }

                        // Get display number from Clio response (e.g., "WEST 10946-00001")
                        const displayNumber = matter.display_number || matter.id;
                        const clioLink = `https://eu.app.clio.com/nc/#/matters/${matter.id}`;
                        
                        // Helper for status badges
                        const getStatusBadge = (status, compact = false) => {
                                if (!status) return '<span style="color: #94a3b8;">—</span>';
                                const lower = String(status).toLowerCase();
                                const size = compact ? '10px' : '11px';
                                const pad = compact ? '2px 6px' : '2px 8px';
                                if (lower.includes('pass') || lower.includes('clear') || lower === 'accept' || lower === 'successful' || lower === 'low') {
                                        return `<span style="display: inline-block; background: #dcfce7; color: #166534; padding: ${pad}; border-radius: 4px; font-size: ${size}; font-weight: 600;">${status}</span>`;
                                } else if (lower.includes('fail') || lower.includes('reject') || lower === 'refer' || lower === 'high') {
                                        return `<span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: ${pad}; border-radius: 4px; font-size: ${size}; font-weight: 600;">${status}</span>`;
                                } else if (lower.includes('pending') || lower.includes('review') || lower === 'medium') {
                                        return `<span style="display: inline-block; background: #fef3c7; color: #92400e; padding: ${pad}; border-radius: 4px; font-size: ${size}; font-weight: 600;">${status}</span>`;
                                }
                                return `<span style="color: #475569;">${status}</span>`;
                        };
                        
                        // Format currency
                        const formatCurrency = (amount) => {
                                if (!amount) return null;
                                return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
                        };

                        const subject = `New Matter Opened: ${displayNumber}`;
                        const logoUrl = 'https://helix-law.co.uk/wp-content/uploads/2025/01/50px-logo.png';
                        const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
                    <!-- Header with Logo + Title -->
                    <tr>
                        <td style="background-color: #f1f5f9; padding: 20px 32px; border-bottom: 1px solid #e2e8f0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="vertical-align: middle;" width="120">
                                        <img src="${logoUrl}" alt="Helix Law" style="height: 32px; display: block;" />
                                    </td>
                                    <td align="right" style="vertical-align: middle;">
                                        <p style="margin: 0; color: #0f172a; font-size: 18px; font-weight: 700;">Matter Opened</p>
                                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Matter Number Hero with Clio Button -->
                    <tr>
                        <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #e2e8f0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="vertical-align: middle;">
                                        <p style="margin: 0 0 4px 0; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Matter Number</p>
                                        <p style="margin: 0; color: #0f172a; font-size: 26px; font-weight: 700; letter-spacing: -0.025em;">${displayNumber}</p>
                                        <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 11px;">Instruction: ${instructionRef || '—'}${dealId ? ` · Deal: ${dealId}` : ''}</p>
                                    </td>
                                    <td align="right" style="vertical-align: middle;">
                                        <a href="${clioLink}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open in Clio</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Details Grid -->
                    <tr>
                        <td style="padding: 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <!-- Client Row -->
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="130" style="color: #64748b; font-size: 12px; font-weight: 500;">Client</td>
                                                <td style="color: #0f172a; font-size: 13px; font-weight: 600;">${clientName}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Client Type Row -->
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="130" style="color: #64748b; font-size: 12px; font-weight: 500;">Client Type</td>
                                                <td style="color: #0f172a; font-size: 13px;">${clientTypeLabel}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Practice Area Row -->
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="130" style="color: #64748b; font-size: 12px; font-weight: 500;">Practice Area</td>
                                                <td style="color: #0f172a; font-size: 13px;">${pa || '—'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Description Row -->
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="130" style="color: #64748b; font-size: 12px; font-weight: 500; vertical-align: top;">Description</td>
                                                <td style="color: #0f172a; font-size: 13px;">${desc || '—'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Team Row -->
                                <tr>
                                    <td style="padding: 10px 0;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="130" style="color: #64748b; font-size: 12px; font-weight: 500;">Team</td>
                                                <td style="color: #0f172a; font-size: 13px;"><span style="font-weight: 600;">${feeEarner}</span>${supervisingPartner ? ` · Supervised by ${supervisingPartner}` : ''}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Compliance Status Section -->
                    <tr>
                        <td style="padding: 0 32px 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8fafc; border-radius: 8px;">
                                <tr>
                                    <td style="padding: 16px;">
                                        <p style="margin: 0 0 12px 0; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Compliance & Onboarding Status</p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <!-- eID Check -->
                                                <td style="padding: 6px 8px 6px 0; vertical-align: top;" width="25%">
                                                    <p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">eID Check</p>
                                                    ${getStatusBadge(eidResult, true)}
                                                </td>
                                                <!-- PEP & Sanctions -->
                                                <td style="padding: 6px 8px; vertical-align: top;" width="25%">
                                                    <p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">PEP/Sanctions</p>
                                                    ${getStatusBadge(pepResult, true)}
                                                </td>
                                                <!-- Address -->
                                                <td style="padding: 6px 8px; vertical-align: top;" width="25%">
                                                    <p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">Address</p>
                                                    ${getStatusBadge(addressResult, true)}
                                                </td>
                                                <!-- Payment -->
                                                <td style="padding: 6px 0 6px 8px; vertical-align: top;" width="25%">
                                                    <p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">Payment</p>
                                                    ${getStatusBadge(paymentResult, true)}
                                                    ${paymentAmount ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 9px;">${formatCurrency(paymentAmount)}</p>` : ''}
                                                </td>
                                            </tr>
                                            <tr>
                                                <!-- Risk Assessment -->
                                                <td style="padding: 6px 8px 6px 0; vertical-align: top;" width="25%">
                                                    <p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">Risk Assessment</p>
                                                    ${getStatusBadge(riskResult || (riskDate ? 'Complete' : ''), true)}
                                                    ${riskScore ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 9px;">Score: ${riskScore}${riskAssessor ? ` (${riskAssessor})` : ''}</p>` : (riskAssessor ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 9px;">By ${riskAssessor}</p>` : '')}
                                                </td>
                                                <!-- eID Reference -->
                                                <td colspan="3" style="padding: 6px 0 6px 8px; vertical-align: top;">
                                                    ${eidCheckId ? `<p style="margin: 0 0 3px 0; color: #64748b; font-size: 10px; font-weight: 500;">eID Reference</p><p style="margin: 0; color: #64748b; font-size: 10px; font-family: monospace;">${eidCheckId}</p>` : ''}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Documents Section -->
                    ${documentCount > 0 ? `
                    <tr>
                        <td style="padding: 0 32px 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8fafc; border-radius: 8px;">
                                <tr>
                                    <td style="padding: 16px;">
                                        <p style="margin: 0 0 12px 0; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Documents (${documentCount})</p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            ${documents.map(doc => {
                                                const name = doc.file_name || 'Unnamed';
                                                const ext = getFileExtension(doc.file_name);
                                                const size = formatFileSize(doc.file_size_bytes);
                                                return `
                                            <tr>
                                                <td style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                                        <tr>
                                                            <td style="color: #0f172a; font-size: 12px; font-weight: 500;">${name}</td>
                                                            <td align="right" style="color: #64748b; font-size: 11px;">${ext ? `<span style="background: #e2e8f0; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; margin-right: 8px;">${ext}</span>` : ''}${size}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>`;
                                            }).join('')}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Footer with IDs -->
                    <tr>
                        <td style="padding: 16px 32px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0; color: #94a3b8; font-size: 11px; text-align: center;">Clio Matter ID: ${matter.id}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                        `;

                        const port = process.env.PORT || 8080;
                        const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
                        const defaultBase = isNamedPipe && process.env.WEBSITE_HOSTNAME
                            ? `https://${process.env.WEBSITE_HOSTNAME}`
                            : `http://localhost:${port}`;
                        const base = process.env.PUBLIC_BASE_URL || defaultBase;
                        
                        // Resolve fee earner email — prefer formData, fall back to DB lookup
                        let feeEarnerEmail = teamSafe.fee_earner_email || null;
                        if (!feeEarnerEmail) {
                                const feInitials = teamSafe.fee_earner_initials || initials;
                                if (feInitials) {
                                        try {
                                                feeEarnerEmail = await teamLookup.getTeamEmail(feInitials);
                                        } catch (lookupErr) {
                                                console.warn('Fee earner email lookup failed:', lookupErr?.message);
                                        }
                                }
                        }

                        // Send to fee earner (primary), CC lz
                        const emailPayload = {
                                user_email: feeEarnerEmail || 'lz@helix-law.com',
                                subject,
                                email_contents: bodyHtml,
                                from_email: 'automations@helix-law.com',
                                cc_emails: feeEarnerEmail ? 'lz@helix-law.com' : '',
                                bcc_emails: '',
                                skip_signature: true
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
                        } else {
                                console.log(`📧 Matter opening email sent for ${displayNumber}`);
                        }
                } catch (emailErr) {
                        console.warn('Email dispatch error (non-blocking):', emailErr?.message || emailErr);
                }

                const matterDurationMs = Date.now() - matterStartTime;
                trackEvent('MatterOpening.ClioMatter.Completed', { instructionRef, initials, displayNumber: matter.display_number || '', clioMatterId: String(matter.id), durationMs: String(matterDurationMs) });
                trackMetric('MatterOpening.ClioMatter.Duration', matterDurationMs, { instructionRef });
                res.json({ ok: true, matter });
    } catch (e) {
        const matterDurationMs = Date.now() - matterStartTime;
        console.error(e);
        trackException(e, { component: 'MatterOpening', operation: 'ClioMatter', phase: 'matterCreation', instructionRef, initials });
        trackEvent('MatterOpening.ClioMatter.Failed', { instructionRef, initials, error: e.message, durationMs: String(matterDurationMs) });
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;
