/**
 * Event Emitter — helper to INSERT events into the shared Events table.
 * Used by tab-app as a producer so its own mutations are visible to other apps.
 *
 * Usage:
 *   const { emitEvent } = require('../utils/eventEmitter');
 *   await emitEvent('enquiry.claimed', 'tab-app', enquiryId, 'enquiry', { claimedBy: 'LZ' });
 */

const { getPool, sql } = require('./db');
const { trackException } = require('./appInsights');
const { createLogger } = require('./logger');

const log = createLogger('EventEmitter');

/**
 * Insert an event into the shared Events table.
 * Non-blocking: failures are logged but don't propagate (fire-and-forget by default).
 *
 * @param {string} eventType  - Dotted type: 'enquiry.claimed', 'matter.opened', etc.
 * @param {string} source     - App name: 'tab-app', 'instruct-pitch', 'enquiry-processing'
 * @param {string} entityId   - Primary identifier: InstructionRef, enquiryId, etc.
 * @param {string} entityType - Entity category: 'enquiry', 'instruction', 'payment', etc.
 * @param {object} [payload]  - Optional JSON-serialisable context data.
 * @param {object} [options]  - { throwOnError: false } — set true to propagate errors.
 */
async function emitEvent(eventType, source, entityId, entityType, payload, options = {}) {
  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) {
      log.warn('No INSTRUCTIONS_SQL_CONNECTION_STRING — cannot emit event');
      return;
    }

    const pool = await getPool(connStr);
    const request = new sql.Request(pool);
    request.input('eventType', sql.NVarChar(100), eventType);
    request.input('source', sql.NVarChar(50), source);
    request.input('entityId', sql.NVarChar(100), String(entityId));
    request.input('entityType', sql.NVarChar(50), entityType);
    request.input('payload', sql.NVarChar(sql.MAX), payload ? JSON.stringify(payload) : null);

    await request.query(`
      INSERT INTO [dbo].[Events] (EventType, Source, EntityId, EntityType, Payload)
      VALUES (@eventType, @source, @entityId, @entityType, @payload)
    `);
  } catch (err) {
    log.error(`Failed to emit ${eventType} for ${entityId}:`, err.message);
    trackException(err, {
      operation: 'EventEmitter.emit',
      eventType,
      source,
      entityId,
      entityType,
    });
    if (options.throwOnError) throw err;
  }
}

module.exports = { emitEvent };
