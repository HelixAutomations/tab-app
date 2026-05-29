const express = require('express');
const path = require('path');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');
const { withRequest } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');
// Ensure a fetch implementation is available.  In some production
// environments the global `fetch` API is missing which would cause the
// route handler to throw a ReferenceError.  Fallback to `node-fetch` when
// necessary so the bundle submission works both locally and after
// deployment.
const fetch = global.fetch || require('node-fetch');

const router = express.Router();

function inLocalMode() {
    return process.env.USE_LOCAL_SECRETS === 'true';
}

// Load local user data if in local mode
let localUsers = [];
if (inLocalMode()) {
    try {
        localUsers = require(path.join(process.cwd(), 'src', 'localData', 'localUserData.json'));
    } catch (err) {
        console.warn('localUserData.json not loaded:', err.message);
        localUsers = [];
    }
}

function findUserByName(name) {
    if (!name) return null;
    return (localUsers || []).find(u => {
        const full = u['Full Name'] || `${u.First} ${u.Last}`;
        return (
            full.toLowerCase() === name.toLowerCase() ||
            (u.Initials && u.Initials.toLowerCase() === name.toLowerCase())
        );
    }) || null;
}

function readAsanaCredentials(userData) {
    if (!userData || typeof userData !== 'object') {
        return { clientId: null, clientSecret: null, refreshToken: null };
    }
    return {
        clientId: userData.ASANAClientID || userData.ASANAClient_ID || null,
        clientSecret: userData.ASANASecret || userData.ASANA_Secret || null,
        refreshToken: userData.ASANARefreshToken || userData.ASANARefresh_Token || null,
    };
}

async function lookupAsanaCredentials(requestUser, fallbackUser) {
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) return null;

    const email = String(requestUser?.email || fallbackUser?.Email || fallbackUser?.email || '').trim().toLowerCase();
    const initials = String(requestUser?.initials || fallbackUser?.Initials || fallbackUser?.initials || '').trim().toUpperCase();
    if (!email && !initials) return null;

    try {
        const result = await withRequest(connectionString, async (request, sql) => {
            let query = `
                SELECT TOP 1
                    [ASANAClient_ID] AS clientId,
                    [ASANASecret] AS clientSecret,
                    [ASANARefreshToken] AS refreshToken
                FROM dbo.team
                WHERE 1 = 1
            `;
            if (email) {
                request.input('email', sql.VarChar(255), email);
                query += ' AND LOWER([Email]) = @email';
            }
            if (initials) {
                request.input('initials', sql.VarChar(10), initials);
                query += ' AND UPPER([Initials]) = @initials';
            }
            return request.query(query);
        });
        const row = result?.recordset?.[0];
        if (!row) return null;
        return {
            clientId: row.clientId || null,
            clientSecret: row.clientSecret || null,
            refreshToken: row.refreshToken || null,
        };
    } catch (err) {
        trackException(err, { phase: 'bundle.asanaCredentialsLookup', initials: initials || null });
        return null;
    }
}

router.post('/', async (req, res) => {
    const {
        name,
        matterReference,
        bundleLink,
        deliveryOptions = {},
        arrivalDate,
        officeReadyDate,
        coveringLetter,
        copiesInOffice,
        notes,
        user,
        simulate,
    } = req.body || {};

    if (!name || !matterReference || !bundleLink) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    let submissionId = null;
    try {
        const submitter = (user && (user.Initials || user.initials)) || req.body?.submitted_by || req.body?.submittedBy || 'UNK';
        submissionId = await recordSubmission({
            formKey: 'bundle',
            submittedBy: String(submitter || 'UNK').slice(0, 10),
            lane: 'Request',
            payload: req.body,
            summary: `Bundle: ${matterReference} — ${name}`.slice(0, 400),
            clientSubmissionId: req.body?.clientSubmissionId || null,
        });
    } catch (logErr) {
        trackException(logErr, { phase: 'bundle.recordSubmission' });
    }

    // Credentials may be supplied directly on the payload or nested under a
    // `user` object.  This mirrors how the client sends user data and avoids
    // additional database lookups in production.
    // Support both camelCase and snake_case field names for compatibility
    const userData = user || req.body;
    let { clientId, clientSecret, refreshToken } = readAsanaCredentials(userData);
    if (!clientId || !clientSecret || !refreshToken) {
        const resolved = await lookupAsanaCredentials(req.user, userData);
        clientId = clientId || resolved?.clientId;
        clientSecret = clientSecret || resolved?.clientSecret;
        refreshToken = refreshToken || resolved?.refreshToken;
    }

    if (!clientId || !clientSecret || !refreshToken) {
        trackEvent('Bundle.AsanaCredentials.Unavailable', {
            hasClientId: !!clientId, 
            hasSecret: !!clientSecret, 
            hasRefreshToken: !!refreshToken,
            initials: req.user?.initials || userData?.Initials || userData?.initials || null,
        });
        return res.status(500).json({ error: 'Asana credentials not found' });
    }

    const projectId = process.env.ASANA_BUNDLE_PROJECT_ID || '1207163713256345';

    const tokenBody = new URLSearchParams();
    tokenBody.append('grant_type', 'refresh_token');
    tokenBody.append('client_id', clientId);
    tokenBody.append('client_secret', clientSecret);
    tokenBody.append('refresh_token', refreshToken);

    try {
    let accessToken = 'mock';
    const usingTestCreds = (clientId && (clientId === 'x' || clientId.startsWith('test'))) || (refreshToken && refreshToken.startsWith('test'));
    const forceSimulate = simulate === true;
    if (!inLocalMode() && !usingTestCreds && !forceSimulate) {
            const tokenResp = await fetch('https://app.asana.com/-/oauth_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenBody.toString()
            });
            if (!tokenResp.ok) {
                const text = await tokenResp.text();
                console.error('Asana token refresh failed', text);
                await recordStep(submissionId, { name: 'asana.tokenRefresh', status: 'failed', error: text.slice(0, 500) });
                await markFailed(submissionId, { lastEvent: 'asana.tokenRefresh:failed', error: new Error('Asana token refresh failed') });
                return res.status(500).json({ error: 'Asana token refresh failed', submissionId });
            }
            const tokenData = await tokenResp.json();
            accessToken = tokenData.access_token;
            await recordStep(submissionId, { name: 'asana.tokenRefresh', status: 'success' });
        } else {
            console.log('Local mode - skipping Asana token refresh');
            accessToken = 'local-token';
        }

        // Helper function to format dates nicely
        const formatDate = (dateString) => {
            if (!dateString) return null;
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-GB', { 
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            } catch (err) {
                return dateString; // fallback to original if parsing fails
            }
        };

        const descriptionParts = [
            `📋 Matter: ${matterReference}`,
            `🔗 Bundle Link: ${bundleLink}`
        ];
        
        if (notes) {
            descriptionParts.push('', `📝 Notes: ${notes}`);
        }
        
        if (deliveryOptions.posted && Array.isArray(deliveryOptions.posted) && deliveryOptions.posted.length > 0) {
            descriptionParts.push('', `📮 POSTED TO: ${deliveryOptions.posted.join(', ')}`);
            if (arrivalDate) {
                const formattedDate = formatDate(arrivalDate);
                descriptionParts.push(`📅 Arrival date: ${formattedDate}`);
            }
            if (coveringLetter && coveringLetter.link) {
                descriptionParts.push(`📄 Covering letter: ${coveringLetter.link} (${coveringLetter.copies} ${coveringLetter.copies === 1 ? 'copy' : 'copies'})`);
            }
        }
        
        if (deliveryOptions.leftInOffice) {
            descriptionParts.push('', '🏢 COPIES LEFT IN OFFICE');
            if (officeReadyDate) {
                const formattedDate = formatDate(officeReadyDate);
                descriptionParts.push(`📅 Office-ready date: ${formattedDate}`);
            }
            if (copiesInOffice) {
                descriptionParts.push(`📋 Number of copies: ${copiesInOffice}`);
            }
        }

        const taskBody = {
            data: {
                projects: [projectId],
                name: `${matterReference} - Bundle`,
                notes: descriptionParts.join('\n')
            }
        };

    if (!inLocalMode() && !usingTestCreds && !forceSimulate) {
            const resp = await fetch('https://app.asana.com/api/1.0/tasks', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskBody)
            });
            if (!resp.ok) {
                const text = await resp.text();
                console.error('Asana task creation failed', text);
                await recordStep(submissionId, { name: 'asana.create', status: 'failed', error: text.slice(0, 500) });
                await markFailed(submissionId, { lastEvent: 'asana.create:failed', error: new Error('Asana task creation failed') });
                return res.status(500).json({ error: 'Asana task creation failed', submissionId });
            }
            const data = await resp.json();

            // Send email notification to operations@helix-law.com
            try {
                const emailSubject = `New Bundle Task: ${matterReference}`;
                const emailContent = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #0078d4 0%, #106ebe 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0; font-size: 24px;">📋 Bundle Task Created</h2>
                        </div>
                        <div style="padding: 20px;">
                            <div style="background: #f8fafc; border-left: 4px solid #0078d4; padding: 15px; margin-bottom: 20px;">
                                <strong>Matter:</strong> ${matterReference}<br>
                                <strong>Bundle Name:</strong> ${name}
                            </div>
                            
                            <div style="margin-bottom: 15px;">
                                <strong>Bundle Link:</strong><br>
                                <a href="${bundleLink}" style="color: #0078d4; text-decoration: none;">${bundleLink}</a>
                            </div>

                            ${deliveryOptions.posted && Array.isArray(deliveryOptions.posted) && deliveryOptions.posted.length > 0 ? `
                            <div style="background: #e8f4fd; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                                <strong>📮 Posted to:</strong> ${deliveryOptions.posted.join(', ')}<br>
                                ${arrivalDate ? `<strong>📅 Arrival date:</strong> ${formatDate(arrivalDate)}<br>` : ''}
                                ${coveringLetter && coveringLetter.link ? `<strong>📄 Covering letter:</strong> <a href="${coveringLetter.link}" style="color: #0078d4;">${coveringLetter.link}</a> (${coveringLetter.copies} ${coveringLetter.copies === 1 ? 'copy' : 'copies'})<br>` : ''}
                            </div>
                            ` : ''}

                            ${deliveryOptions.leftInOffice ? `
                            <div style="background: #fff4e6; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                                <strong>🏢 Copies left in office</strong><br>
                                ${officeReadyDate ? `<strong>📅 Office-ready date:</strong> ${formatDate(officeReadyDate)}<br>` : ''}
                                ${copiesInOffice ? `<strong>📋 Number of copies:</strong> ${copiesInOffice}<br>` : ''}
                            </div>
                            ` : ''}

                            ${notes ? `
                            <div style="margin-bottom: 15px;">
                                <strong>📝 Notes:</strong><br>
                                ${notes}
                            </div>
                            ` : ''}

                            <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-top: 20px;">
                                <strong>ℹ️ This bundle task has been automatically created in Asana.</strong>
                            </div>
                        </div>
                    </div>
                `;

                // Re-use existing Azure Function /api/sendEmail (proxied) to send operations notification
                const emailPayload = {
                    user_email: 'operations@helix-law.com',
                    subject: emailSubject,
                    email_contents: emailContent,
                    from_email: 'automations@helix-law.com'
                };
                const emailResp = await fetch(`${process.env.PUBLIC_BASE_URL || ''}/api/sendEmail`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(emailPayload)
                });
                if (!emailResp.ok) {
                    const errText = await emailResp.text();
                    console.warn('Bundle notification email failed', errText);
                    await recordStep(submissionId, { name: 'email.operations', status: 'failed', error: errText.slice(0, 500) });
                } else {
                    console.log('Bundle notification email sent');
                    await recordStep(submissionId, { name: 'email.operations', status: 'success' });
                }
            } catch (emailErr) {
                console.warn('Email notification error:', emailErr);
                await recordStep(submissionId, { name: 'email.operations', status: 'failed', error: emailErr?.message || String(emailErr) });
                // Don't fail the whole request if email fails
            }

            await recordStep(submissionId, {
                name: 'asana.create',
                status: 'success',
                output: { taskId: data?.data?.gid },
            });
            await markComplete(submissionId, { lastEvent: 'bundle task created' });
            return res.json({
                ok: true,
                task: data.data,
                mode: 'live',
                submissionId,
                streamUrl: submissionId ? `forms?focusSubmission=${submissionId}` : null,
            });
        } else {
            console.log('Simulated mode - skipping Asana task creation and email notification');
            await recordStep(submissionId, {
                name: 'asana.create',
                status: 'success',
                output: { simulated: true },
            });
            await markComplete(submissionId, { lastEvent: 'bundle simulated' });
            return res.json({
                ok: true,
                simulated: true,
                mode: forceSimulate ? 'forced' : (usingTestCreds ? 'test-credentials' : (inLocalMode() ? 'local' : 'auto-skip')),
                submissionId,
                streamUrl: submissionId ? `forms?focusSubmission=${submissionId}` : null,
            });
        }
    } catch (err) {
        console.error('Bundle submission failed', err);
        if (submissionId) {
            await markFailed(submissionId, { lastEvent: 'bundle:failed', error: err });
        }
        res.status(500).json({ error: 'Bundle submission failed', submissionId });
    }
});

module.exports = router;