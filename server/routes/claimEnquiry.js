const express = require('express');
const { getSecret } = require('../utils/getSecret');
const { append, redact } = require('../utils/opLog');
const { CACHE_CONFIG, deleteCachePattern } = require('../utils/redisClient');
const { broadcastEnquiriesChanged } = require('../utils/enquiries-stream');

const router = express.Router();

/**
 * Claim an enquiry via the enquiry-processing platform.
 * This triggers the full claim flow: SQL update, ActiveCampaign sync, and Teams card update.
 * 
 * POST /api/claimEnquiry
 * Body: { enquiryId: string, userEmail: string, dataSource: 'new' | 'legacy' }
 * 
 * dataSource determines which database to update:
 * - 'new': instructions DB (lowercase snake_case schema, id is INT)
 * - 'legacy': helix-core-data (spaced columns, ID is NVARCHAR)
 */
router.post('/', async (req, res) => {
    const { enquiryId, userEmail, dataSource = 'legacy' } = req.body;

    // Validate required fields
    if (!enquiryId || !userEmail) {
        console.warn('claimEnquiry: Missing enquiryId or userEmail', { enquiryId, userEmail: userEmail ? '***' : undefined, dataSource });
        return res.status(400).json({
            success: false,
            message: 'Missing enquiryId or userEmail in request body'
        });
    }

    append({ 
        type: 'claim', 
        action: 'claimEnquiry', 
        status: 'started', 
        enquiryId,
        dataSource,
        userEmail: redact(userEmail)
    });

    try {
        // Get the platform base URL
        const platformBaseUrl = process.env.ENQUIRY_PLATFORM_BASE_URL || 
            'https://enquiry-processing-v2.azurewebsites.net';

        const url = `${platformBaseUrl}/api/hub-claim`;

        console.log('claimEnquiry: Calling platform endpoint', { 
            enquiryId, 
            dataSource,
            userEmail: '***',
            url: redact(url)
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': '2011'
            },
            body: JSON.stringify({
                enquiryId,
                userEmail,
                dataSource,
                source: 'hub',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('claimEnquiry: Platform returned error', { 
                status: response.status, 
                error: errorText 
            });
            
            append({ 
                type: 'claim', 
                action: 'claimEnquiry', 
                status: 'error', 
                enquiryId,
                httpStatus: response.status,
                error: errorText.substring(0, 200)
            });

            return res.status(response.status).json({
                success: false,
                message: 'Platform claim request failed',
                error: errorText
            });
        }

        const result = await response.json();

        console.log('claimEnquiry: Successfully claimed enquiry', { 
            enquiryId, 
            operations: result.operations 
        });

        append({ 
            type: 'claim', 
            action: 'claimEnquiry', 
            status: 'success', 
            enquiryId,
            operations: result.operations
        });

        // Ensure unified enquiries lists refresh correctly after claim.
        // Claiming can happen via an external platform, so we invalidate our local unified cache.
        try {
            const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
            const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
            console.log('claimEnquiry: Invalidated unified cache', { deletedData, deletedEnquiries });
        } catch (cacheErr) {
            console.warn('claimEnquiry: Cache invalidation failed (non-blocking)', cacheErr?.message);
        }

        // Notify connected clients (Enquiries tab).
        // Include claimedAt so the UI can patch immediately without a full refetch.
        try {
            broadcastEnquiriesChanged({
                changeType: 'claim',
                enquiryId: String(enquiryId),
                claimedBy: String(userEmail),
                claimedAt: new Date().toISOString(),
            });
        } catch { /* non-blocking */ }

        res.json({
            success: true,
            message: 'Enquiry claimed successfully',
            enquiryId,
            claimedBy: userEmail,
            operations: result.operations
        });

    } catch (error) {
        console.error('claimEnquiry: Unexpected error', { 
            enquiryId, 
            error: error.message 
        });

        append({ 
            type: 'claim', 
            action: 'claimEnquiry', 
            status: 'error', 
            enquiryId,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to claim enquiry',
            error: error.message
        });
    }
});

module.exports = router;
