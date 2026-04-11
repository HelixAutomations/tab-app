/**
 * Shared server status module.
 * Both server/index.js (dev) and server/server.js (prod) write here;
 * the health route reads it to report component health.
 */

const _status = {
    redis: null,          // true | false | null (unknown)
    sql: null,
    instructionsSql: null,
    clio: null,
    scheduler: false,
    eventPoller: false,
    startedAt: Date.now(),
};

function setStatus(component, value) {
    if (component in _status) _status[component] = value;
}

function getStatus() {
    return {
        ..._status,
        uptimeSeconds: Math.floor((Date.now() - _status.startedAt) / 1000),
    };
}

module.exports = { setStatus, getStatus };
