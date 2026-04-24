/**
 * Future Bookings Routes
 * Handles boardroom and soundproof pod bookings from helix-project-data database
 */

const express = require('express');
const router = express.Router();
const { withRequest } = require('../utils/db');
const { cacheWrapper, generateCacheKey, deleteCache } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');
const { attachFutureBookingsStream } = require('../utils/future-bookings-stream');

const log = loggers.db.child('FutureBookings');

async function getFutureBookingsSnapshot({ forceRefresh = false } = {}) {
  const baseConnectionString = process.env.SQL_CONNECTION_STRING;
  if (!baseConnectionString) {
    log.error('SQL_CONNECTION_STRING not configured');
    throw new Error('Database configuration missing');
  }

  const projectDataConnectionString = baseConnectionString.replace(
    /Initial Catalog=helix-core-data/i,
    'Initial Catalog=helix-project-data'
  );

  const today = new Date().toISOString().split('T')[0];
  const cacheKey = generateCacheKey('metrics', 'future-bookings', today);

  if (forceRefresh) {
    try {
      await deleteCache(cacheKey);
    } catch {
      // Non-blocking
    }
  }

  return cacheWrapper(
    cacheKey,
    async () => {
      const boardroomResult = await withRequest(
        projectDataConnectionString,
        async (request) => {
          const query = `
            SELECT id, fee_earner, booking_date, booking_time, duration, reason, created_at, updated_at
            FROM [dbo].[boardroom_bookings]
            WHERE booking_date >= CAST(GETDATE() AS date)
          `;
          return await request.query(query);
        }
      );

      const soundproofResult = await withRequest(
        projectDataConnectionString,
        async (request) => {
          const query = `
            SELECT id, fee_earner, booking_date, booking_time, duration, reason, created_at, updated_at
            FROM [dbo].[soundproofpod_bookings]
            WHERE booking_date >= CAST(GETDATE() AS date)
          `;
          return await request.query(query);
        }
      );

      const formatBooking = (booking, spaceType) => ({
        ...booking,
        booking_date: booking.booking_date?.toISOString().substring(0, 10),
        booking_time: booking.booking_time instanceof Date
          ? booking.booking_time.toISOString().substring(11, 19)
          : booking.booking_time,
        spaceType
      });

      const boardroomBookings = boardroomResult.recordset.map((booking) => formatBooking(booking, 'Boardroom'));
      const soundproofBookings = soundproofResult.recordset.map((booking) => formatBooking(booking, 'Soundproof Pod'));

      return {
        boardroomBookings,
        soundproofBookings
      };
    },
    900
  );
}

/**
 * GET /api/future-bookings
 * Returns future bookings for boardrooms and soundproof pods
 */
router.get('/', async (req, res) => {
  try {
    const forceRefresh = String(req.query?.forceRefresh || '').toLowerCase() === 'true';
    const bookingsData = await getFutureBookingsSnapshot({ forceRefresh });

    res.json(bookingsData);
  } catch (error) {
    log.fail('bookings:fetch', error, {});
    res.status(500).json({ 
      error: 'Error retrieving future bookings'
    });
  }
});

// SSE: future bookings realtime change notifications
attachFutureBookingsStream(router);

module.exports = router;
module.exports.getFutureBookingsSnapshot = getFutureBookingsSnapshot;
