// Shared SSE endpoint registry.
//
// EventSource cannot attach custom headers, so these paths bypass:
//   1) `requireUser` auth (no x-helix-* identity is sent), and
//   2) gzip compression (response must stream un-buffered).
//
// Add a new SSE route here ONCE. Both consumers import the same array.

const SSE_PATH_PREFIXES = [
    '/api/reporting-stream',
    '/api/home-metrics',
    '/api/logs/stream',
    '/api/ccl-date',
    '/api/enquiries-unified/stream',
    '/api/attendance/annual-leave/stream',
    '/api/attendance/attendance/stream',
    '/api/future-bookings/stream',
    '/api/data-operations/stream',
    '/api/ops-pulse',
];

function isSsePath(path) {
    if (!path) return false;
    for (const prefix of SSE_PATH_PREFIXES) {
        if (path.startsWith(prefix)) return true;
    }
    return false;
}

module.exports = { SSE_PATH_PREFIXES, isSsePath };
