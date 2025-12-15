/**
 * Future Bookings Routes
 * Handles boardroom and soundproof pod bookings from helix-project-data database
 */

const express = require('express');
const router = express.Router();
const { withRequest } = require('../utils/db');
const { cacheWrapper, generateCacheKey } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');

const log = loggers.db.child('FutureBookings');

/**
 * GET /api/future-bookings
 * Returns future bookings for boardrooms and soundproof pods
 */
router.get('/', async (req, res) => {
  try {
    // Get base connection string and modify for helix-project-data database
    const baseConnectionString = process.env.SQL_CONNECTION_STRING;
    if (!baseConnectionString) {
      log.error('SQL_CONNECTION_STRING not configured');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    // Replace database name in connection string
    const projectDataConnectionString = baseConnectionString.replace(
      /Initial Catalog=helix-core-data/i,
      'Initial Catalog=helix-project-data'
    );

    // Generate cache key based on current date (bookings are date-sensitive)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'future-bookings', today);

    const bookingsData = await cacheWrapper(
      cacheKey,
      async () => {
        // Query boardroom bookings
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

        // Query soundproof pod bookings
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

        // Format dates properly
        const formatBooking = (booking, spaceType) => ({
          ...booking,
          booking_date: booking.booking_date?.toISOString().substring(0, 10),
          booking_time: booking.booking_time instanceof Date 
            ? booking.booking_time.toISOString().substring(11, 19)
            : booking.booking_time,
          spaceType
        });

        const boardroomBookings = boardroomResult.recordset.map(b => formatBooking(b, 'Boardroom'));
        const soundproofBookings = soundproofResult.recordset.map(b => formatBooking(b, 'Soundproof Pod'));

        return {
          boardroomBookings,
          soundproofBookings
        };
      },
      900 // 15 minutes TTL - bookings can change during the day but not frequently
    );

    res.json(bookingsData);
  } catch (error) {
    log.fail('bookings:fetch', error, {});
    res.status(500).json({ 
      error: 'Error retrieving future bookings'
    });
  }
});

module.exports = router;
