const express = require('express');

const router = express.Router();

// === Back-compat redirects ===
// Legacy function paths → migrated Express routes.
// These catch any residual callers still using the old paths.
router.post('/getAnnualLeave', (req, res) => {
    try {
        // Preserve method and body using 307 Temporary Redirect
        res.redirect(307, '/api/attendance/getAnnualLeave');
    } catch (e) {
        console.error('Failed to redirect /getAnnualLeave to /api/attendance/getAnnualLeave', e);
        res.status(500).json({ error: 'Redirect failed' });
    }
});

// Back-compat: redirect legacy attendance function path to Express route
router.post('/getAttendance', (req, res) => {
    try {
        res.redirect(307, '/api/attendance/getAttendance');
    } catch (e) {
        console.error('Failed to redirect /getAttendance to /api/attendance/getAttendance', e);
        res.status(500).json({ error: 'Redirect failed' });
    }
});

// Back-compat: redirect legacy matters endpoints to Express routes
router.get('/getMatters', (req, res) => {
    try { res.redirect(307, '/api/getMatters'); } catch (e) {
        console.error('Failed to redirect GET /getMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});
router.post('/getMatters', (req, res) => {
    try { res.redirect(307, '/api/getMatters'); } catch (e) {
        console.error('Failed to redirect POST /getMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});
router.get('/getAllMatters', (req, res) => {
    try { res.redirect(307, '/api/getAllMatters'); } catch (e) {
        console.error('Failed to redirect GET /getAllMatters', e); res.status(500).json({ error: 'Redirect failed' }); }
});

// Back-compat: redirect legacy sendEmail to centralized Express route
router.post('/sendEmail', (req, res) => {
    try { res.redirect(307, '/api/sendEmail'); } catch (e) {
        console.error('Failed to redirect /sendEmail to /api/sendEmail', e); res.status(500).json({ error: 'Redirect failed' }); }
});

function redirectWithQuery(targetPath) {
    return (req, res) => {
        try {
            const queryIndex = req.originalUrl.indexOf('?');
            const suffix = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
            res.redirect(307, `${targetPath}${suffix}`);
        } catch (e) {
            console.error(`Failed to redirect ${req.originalUrl} to ${targetPath}`, e);
            res.status(500).json({ error: 'Redirect failed' });
        }
    };
}

router.get('/getPOID6Years', redirectWithQuery('/api/poid/6years'));
router.get('/getComplianceData', redirectWithQuery('/api/compliance'));
router.post('/getComplianceData', redirectWithQuery('/api/compliance'));
router.get('/getFutureBookings', redirectWithQuery('/api/future-bookings'));
router.get('/getTransactions', redirectWithQuery('/api/transactions'));
router.get('/getOutstandingClientBalances', redirectWithQuery('/api/outstanding-balances'));
router.get('/getUserData', redirectWithQuery('/api/user-data'));
router.get('/getTeamData', redirectWithQuery('/api/team-data'));

// Handle OPTIONS requests for CORS
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.sendStatus(200);
});

module.exports = router;
