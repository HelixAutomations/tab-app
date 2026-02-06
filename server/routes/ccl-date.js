// CCL Date API
// Updates Clio Matter custom field "CCL Date" and mirrors the value into legacy SQL matters.CCL_date

const express = require('express');
const router = express.Router();
const { withRequest, sql } = require('../utils/db');
const fetch = global.fetch || require('node-fetch');

const CCL_DATE_FIELD_ID = process.env.CLIO_CCL_DATE_FIELD_ID || '381463';

// Admin gating for CCL Date writes (Clio + legacy SQL).
const DEFAULT_ADMIN_INITIALS = ['LZ', 'RL', 'LB', 'MC', 'AH', 'JH'];
const ADMIN_INITIALS = new Set(
    String(process.env.ADMIN_USERS_INITIALS || '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .concat(DEFAULT_ADMIN_INITIALS)
);

function requireAdminInitials(req, res, next) {
    const initialsRaw = req.query?.initials || req.body?.initials || req.headers?.['x-helix-initials'];
    const initials = String(initialsRaw || '').trim().toUpperCase();

    if (!initials) {
        return res.status(401).json({ error: 'Missing initials' });
    }
    if (!ADMIN_INITIALS.has(initials)) {
        return res.status(403).json({ error: 'Admin only' });
    }
    return next();
}

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

async function updateSingleMatterDateField(matterId, displayNumber, dateValue, accessToken, fieldId) {
    const clioBase = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';

    try {
        const parsedFieldId = parseInt(fieldId);

        // First fetch existing custom field values so we can update-in-place if present
        const matterUrl = `${clioBase}/matters/${matterId}.json?fields=custom_field_values{id,custom_field}`;
        const matterResp = await fetch(matterUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        let existingValueId = null;
        if (matterResp.ok) {
            const matterData = await matterResp.json();
            const existingValues = matterData.data?.custom_field_values || [];
            const existingField = existingValues.find(v => v.custom_field?.id === parsedFieldId);
            if (existingField) {
                existingValueId = existingField.id;
            }
        }

        const customFieldValue = {
            custom_field: { id: parsedFieldId },
            value: dateValue,
        };

        if (existingValueId) {
            customFieldValue.id = existingValueId;
        }

        const updateUrl = `${clioBase}/matters/${matterId}.json`;
        const updateResp = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: {
                    custom_field_values: [customFieldValue],
                },
            }),
        });

        if (updateResp.ok) {
            return { success: true };
        }

        if (updateResp.status === 404) {
            return { success: true, skipped: true };
        }

        const errorText = await updateResp.text();
        return { success: false, error: `${updateResp.status}: ${errorText.substring(0, 150)}` };
    } catch (err) {
        return { success: false, error: err?.message || String(err) };
    }
}

async function updateLegacySqlCclDate(legacyConn, matterId, displayNumber, dateValue) {
    await withRequest(legacyConn, async (request) => {
        request.input('matter_id', sql.NVarChar, String(matterId));
        request.input('display_number', sql.NVarChar, String(displayNumber));
        request.input('ccl_date', sql.Date, new Date(dateValue));

        // Legacy table uses spaced keys but column is CCL_date
        await request.query(`
            UPDATE matters
            SET [CCL_date] = @ccl_date
            WHERE [Unique ID] = @matter_id OR [Display Number] = @display_number
        `);
    });
}

/**
 * POST /api/ccl-date/stream
 * Body (preferred): { updates: Array<{ matter_id: string, display_number?: string, date_value: 'YYYY-MM-DD' }> }
 * Body (legacy): { matter_ids: string[], display_numbers: string[], date_value: 'YYYY-MM-DD' }
 * Streams progress as Server-Sent Events (SSE)
 */
router.post('/stream', requireAdminInitials, async (req, res) => {
    const { updates, matter_ids, display_numbers, date_value } = req.body || {};

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const isUpdatesPayload = Array.isArray(updates);

    const items = isUpdatesPayload
        ? updates
        : (Array.isArray(matter_ids) ? matter_ids : []).map((id, i) => ({
            matter_id: id,
            display_number: (Array.isArray(display_numbers) ? display_numbers : [])[i] || id,
            date_value,
        }));

    // Validate payload
    const invalidItem = items.find((u) => {
        const mId = u?.matter_id;
        const dVal = u?.date_value;
        return !mId || typeof mId !== 'string' || !dVal || typeof dVal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dVal);
    });

    if (invalidItem) {
        sendEvent({ type: 'error', message: 'Each update must include matter_id and date_value (YYYY-MM-DD)' });
        sendEvent({ type: 'complete', success: false, clio_updates: { success: 0, failed: 0, skipped: 0 } });
        return res.end();
    }

    const matters = items;

    const legacyConn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    if (!legacyConn) {
        sendEvent({ type: 'error', message: 'Missing legacy database connection string' });
        sendEvent({ type: 'complete', success: false, clio_updates: { success: 0, failed: matters.length, skipped: 0 } });
        return res.end();
    }

    if (matters.length === 0) {
        sendEvent({ type: 'complete', success: true, clio_updates: { success: 0, failed: 0, skipped: 0 } });
        return res.end();
    }

    const fieldId = parseInt(CCL_DATE_FIELD_ID);
    if (!fieldId) {
        sendEvent({ type: 'error', message: 'Missing/invalid CLIO_CCL_DATE_FIELD_ID' });
        sendEvent({ type: 'complete', success: false, clio_updates: { success: 0, failed: matters.length, skipped: 0 } });
        return res.end();
    }

    sendEvent({ type: 'progress', step: 'clio', message: `Updating CCL Date for ${matters.length} matters...`, total: matters.length });

    let accessToken;
    try {
        accessToken = await getClioAccessToken();
    } catch (authErr) {
        sendEvent({ type: 'error', message: `Clio auth failed: ${authErr.message}` });
        sendEvent({ type: 'complete', success: false, clio_updates: { success: 0, failed: matters.length, skipped: 0, errors: [authErr.message] } });
        return res.end();
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < matters.length; i++) {
        const item = matters[i];
        const matterId = item.matter_id;
        const displayNumber = item.display_number || matterId;
        const itemDateValue = item.date_value;

        sendEvent({ type: 'matter-start', index: i, matterId, displayNumber, total: matters.length });

        const clioResult = await updateSingleMatterDateField(matterId, displayNumber, itemDateValue, accessToken, fieldId);

        // Always attempt SQL update if Clio succeeded or was skipped
        let sqlError = null;
        if (clioResult.success) {
            try {
                await updateLegacySqlCclDate(legacyConn, matterId, displayNumber, itemDateValue);
            } catch (e) {
                sqlError = e?.message || String(e);
            }
        }

        if (clioResult.success && !sqlError) {
            if (clioResult.skipped) {
                skipped++;
                sendEvent({
                    type: 'matter-complete',
                    index: i,
                    matterId,
                    displayNumber,
                    success: true,
                    skipped: true,
                    message: 'Not found in Clio (updated SQL only)',
                    progress: { success, failed, skipped, total: matters.length },
                });
            } else {
                success++;
                sendEvent({
                    type: 'matter-complete',
                    index: i,
                    matterId,
                    displayNumber,
                    success: true,
                    progress: { success, failed, skipped, total: matters.length },
                });
            }
        } else {
            failed++;
            const errMsg = sqlError ? `SQL update failed: ${sqlError}` : clioResult.error || 'Unknown error';
            errors.push(`${displayNumber}: ${errMsg}`);
            sendEvent({
                type: 'matter-complete',
                index: i,
                matterId,
                displayNumber,
                success: false,
                error: errMsg,
                progress: { success, failed, skipped, total: matters.length },
            });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    sendEvent({ type: 'complete', success: true, clio_updates: { success, failed, skipped, errors } });
    return res.end();
});

module.exports = router;
