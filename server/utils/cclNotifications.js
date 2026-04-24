/**
 * CCL Notifications — Teams card / email dispatch for autopilot service runs.
 *
 * Phase A (shipped 2026-04-19): Teams DM to Luke only. Email path stubbed and
 * deliberately disabled until template + recipient rules are signed off.
 *
 * Gated by env var `CCL_AUTO_NOTIFY_FEE_EARNER=1`. Called fire-and-forget from
 * `server/routes/ccl.js` `/service/run` after `persistCclSnapshot` resolves.
 *
 * Related brief: docs/notes/CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md
 */

const { sendCardToDM } = require('./teamsNotificationClient');
const { trackEvent, trackException } = require('./appInsights');

// During Phase A we only DM Luke. Widening to real fee earners happens after
// the copy + flag defaults are confirmed in staging (see brief §3 Phase A).
const PHASE_A_DM_RECIPIENT = 'lz@helix-law.com';

function escape(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function formatConfidence(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'full') return 'High';
    if (v === 'partial') return 'Partial';
    if (v === 'fallback') return 'Fallback';
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Unknown';
}

function resolveHubBaseUrl() {
    const fromEnv = (process.env.HUB_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    // Local/dev fallback — the deep link still renders; it just won't click
    // through from a Teams mobile client until this is set in Azure app settings.
    return 'http://localhost:3000';
}

function buildReviewUrl(matterId) {
    const base = resolveHubBaseUrl();
    const id = encodeURIComponent(String(matterId || ''));
    return `${base}/?tab=operations&cclMatter=${id}&autoReview=1`;
}

function buildAdaptiveCard({
    matterId,
    matterDisplayNumber,
    clientName,
    feeEarner,
    practiceArea,
    confidence,
    fieldCount,
    unresolvedCount,
    ndDocumentId,
    reviewUrl,
}) {
    const facts = [
        matterDisplayNumber ? { title: 'Matter', value: escape(matterDisplayNumber) } : null,
        clientName ? { title: 'Client', value: escape(clientName) } : null,
        feeEarner ? { title: 'Fee earner', value: escape(feeEarner) } : null,
        practiceArea ? { title: 'Practice area', value: escape(practiceArea) } : null,
        { title: 'Confidence', value: formatConfidence(confidence) },
        Number.isFinite(fieldCount) && fieldCount > 0 ? { title: 'Fields populated', value: String(fieldCount) } : null,
        Number.isFinite(unresolvedCount) && unresolvedCount > 0 ? { title: 'Unresolved', value: String(unresolvedCount) } : null,
        ndDocumentId ? { title: 'NetDocuments', value: `Doc ${escape(ndDocumentId)}` } : null,
    ].filter(Boolean);

    return {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body: [
            {
                type: 'TextBlock',
                text: 'CCL draft ready for review',
                weight: 'Bolder',
                size: 'Medium',
                wrap: true,
            },
            {
                type: 'TextBlock',
                text: 'The autopilot service has finished generating a draft. Open the review rail to sign off or adjust.',
                wrap: true,
                spacing: 'Small',
                isSubtle: true,
            },
            {
                type: 'FactSet',
                facts,
                spacing: 'Medium',
            },
        ],
        actions: [
            {
                type: 'Action.OpenUrl',
                title: 'Open review rail',
                url: reviewUrl,
            },
        ],
    };
}

/**
 * Send the "CCL draft ready" Teams card.
 * Fire-and-forget — callers should not await the result for user-facing latency.
 *
 * @param {object} params
 * @param {string} params.matterId            Matter identifier (URL/query-param safe)
 * @param {string} [params.matterDisplayNumber]
 * @param {string} [params.clientName]
 * @param {string} [params.feeEarner]         Display name, not email
 * @param {string} [params.feeEarnerEmail]    Reserved — Phase A always routes to Luke
 * @param {string} [params.practiceArea]
 * @param {string} [params.confidence]        'full' | 'partial' | 'fallback'
 * @param {number} [params.fieldCount]
 * @param {number} [params.unresolvedCount]
 * @param {string} [params.ndDocumentId]
 * @param {string} [params.triggeredBy]       Initials or actor label for telemetry
 * @returns {Promise<{ sent: boolean, skipped?: string, error?: string }>}
 */
async function notifyCclReady(params = {}) {
    const {
        matterId,
        matterDisplayNumber,
        clientName,
        feeEarner,
        practiceArea,
        confidence,
        fieldCount,
        unresolvedCount,
        ndDocumentId,
        triggeredBy,
    } = params;

    const enabled = String(process.env.CCL_AUTO_NOTIFY_FEE_EARNER || '').trim() === '1';
    if (!enabled) {
        return { sent: false, skipped: 'flag-disabled' };
    }

    if (!matterId) {
        return { sent: false, skipped: 'missing-matterId' };
    }

    const normalisedConfidence = String(confidence || '').trim().toLowerCase();
    if (normalisedConfidence === 'fallback') {
        trackEvent('CCL.Notification.Teams.Skipped', {
            matterId: String(matterId),
            reason: 'fallback-confidence',
            triggeredBy: String(triggeredBy || ''),
        });
        return { sent: false, skipped: 'fallback-confidence' };
    }

    if (Number.isFinite(unresolvedCount) && unresolvedCount > 0) {
        trackEvent('CCL.Notification.Teams.Skipped', {
            matterId: String(matterId),
            reason: 'unresolved-placeholders',
            unresolvedCount: String(unresolvedCount),
            triggeredBy: String(triggeredBy || ''),
        });
        return { sent: false, skipped: 'unresolved-placeholders' };
    }

    const reviewUrl = buildReviewUrl(matterId);
    const card = buildAdaptiveCard({
        matterId,
        matterDisplayNumber,
        clientName,
        feeEarner,
        practiceArea,
        confidence: normalisedConfidence,
        fieldCount,
        unresolvedCount,
        ndDocumentId,
        reviewUrl,
    });

    const summary = `CCL draft ready${matterDisplayNumber ? ` — ${matterDisplayNumber}` : ''}`;

    trackEvent('CCL.Notification.Teams.Started', {
        matterId: String(matterId),
        recipient: PHASE_A_DM_RECIPIENT,
        confidence: normalisedConfidence,
        triggeredBy: String(triggeredBy || ''),
    });

    try {
        const result = await sendCardToDM(PHASE_A_DM_RECIPIENT, card, summary);
        if (result && result.success) {
            trackEvent('CCL.Notification.Teams.Sent', {
                matterId: String(matterId),
                recipient: PHASE_A_DM_RECIPIENT,
                activityId: String(result.activityId || ''),
                durationMs: String(result.durationMs || ''),
                triggeredBy: String(triggeredBy || ''),
            });
            return { sent: true };
        }
        const errorMessage = (result && result.error) || 'unknown-failure';
        trackEvent('CCL.Notification.Teams.Failed', {
            matterId: String(matterId),
            recipient: PHASE_A_DM_RECIPIENT,
            error: String(errorMessage).slice(0, 300),
            statusCode: String(result?.statusCode || ''),
            triggeredBy: String(triggeredBy || ''),
        });
        return { sent: false, error: errorMessage };
    } catch (err) {
        trackException(err, {
            operation: 'CCL.Notification.Teams',
            matterId: String(matterId),
            recipient: PHASE_A_DM_RECIPIENT,
        });
        trackEvent('CCL.Notification.Teams.Failed', {
            matterId: String(matterId),
            recipient: PHASE_A_DM_RECIPIENT,
            error: err.message.slice(0, 300),
            triggeredBy: String(triggeredBy || ''),
        });
        return { sent: false, error: err.message };
    }
}

module.exports = {
    notifyCclReady,
    buildReviewUrl,
    PHASE_A_DM_RECIPIENT,
};
