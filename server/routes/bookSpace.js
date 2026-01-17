const express = require('express');
const { sql, withRequest } = require('../utils/db');
const axios = require('axios');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const router = express.Router();
const { deleteCache, deleteCachePattern, generateCacheKey } = require('../utils/redisClient');
const { broadcastFutureBookingsChanged } = require('../utils/future-bookings-stream');

const TRANSIENT_SQL_CODES = new Set(['ESOCKET', 'ECONNCLOSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT']);
const DEFAULT_ATTENDANCE_RETRIES = Number(process.env.SQL_ATTENDANCE_MAX_RETRIES || 4);

const attendanceQuery = (connectionString, executor, retries = DEFAULT_ATTENDANCE_RETRIES) =>
  withRequest(connectionString, executor, retries);

// Cache variables for SQL password
let cachedSqlPassword = null;
let sqlPasswordExpiry = 0; // epoch ms
let sqlPasswordPromise = null; // de-dup concurrent fetches

async function getSqlPassword() {
  // Allow local override via env for dev
  const envPwd = process.env.SQL_DATABASESERVER_PASSWORD || process.env.SQL_DB_PASSWORD || process.env.SQL_PASSWORD;
  if (envPwd && !cachedSqlPassword) {
    cachedSqlPassword = envPwd;
    sqlPasswordExpiry = Date.now() + 60 * 60 * 1000; // 1h TTL
  }

  const now = Date.now();
  if (cachedSqlPassword && now < sqlPasswordExpiry) return cachedSqlPassword;
  if (sqlPasswordPromise) return sqlPasswordPromise;

  sqlPasswordPromise = (async () => {
    try {
      const credential = new DefaultAzureCredential();
      const client = new SecretClient(KV_URI, credential);
      const secretResponse = await client.getSecret("sql-databaseserver-password");
      const pwd = secretResponse.value;
      cachedSqlPassword = pwd;
      sqlPasswordExpiry = Date.now() + 60 * 60 * 1000; // 1h TTL
      return pwd;
    } catch (error) {
      console.error("Failed to retrieve SQL password from Key Vault:", error);
      throw error;
    } finally {
      sqlPasswordPromise = null;
    }
  })();

  return sqlPasswordPromise;
}

// Test route to verify the module loads
router.get('/test', (req, res) => {
  res.json({ message: 'bookSpace router is working' });
});

const KV_URI = "https://helix-keys.vault.azure.net/";
const CLIO_TOKEN_URL = "https://eu.app.clio.com/oauth/token";
const CLIO_CALENDAR_URL = "https://eu.app.clio.com/api/v4/calendar_entries.json";
const CLIO_CALENDAR_ID = 170197;

// Get Clio access token
async function getClioAccessToken() {
  const secretClient = new SecretClient(KV_URI, new DefaultAzureCredential());
  const [clientIdSecret, clientSecretSecret, refreshTokenSecret] = await Promise.all([
    secretClient.getSecret("clio-officeattendance-clientid"),
    secretClient.getSecret("clio-officeattendance-clientsecret"),
    secretClient.getSecret("clio-officeattendance-refreshtoken"),
  ]);
  
  const params = new URLSearchParams({
    client_id: clientIdSecret.value,
    client_secret: clientSecretSecret.value,
    grant_type: "refresh_token",
    refresh_token: refreshTokenSecret.value,
  });
  
  const response = await axios.post(CLIO_TOKEN_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  
  return response.data.access_token;
}

// Create Clio calendar event
async function createClioCalendarEvent(accessToken, { fee_earner, booking_date, booking_time, duration, reason, spaceType }) {
  const startDateTime = new Date(`${booking_date}T${booking_time}Z`);
  const endDateTime = new Date(startDateTime.getTime() + duration * 3600000);
  
  const eventPayload = {
    data: {
      calendar_owner: { id: CLIO_CALENDAR_ID },
      summary: `${spaceType} Booking - ${reason}`,
      description: `Booked by ${fee_earner}. Reason: ${reason}`,
      start_at: startDateTime.toISOString(),
      end_at: endDateTime.toISOString(),
      location: spaceType === "Boardroom" ? "Boardroom" : "Soundproof Pod",
    },
  };
  
  const response = await axios.post(CLIO_CALENDAR_URL, eventPayload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  
  return response.data;
}

// POST /api/book-space - Create a space booking
router.post('/', async (req, res) => {
  const { fee_earner, booking_date, booking_time, duration, reason, spaceType } = req.body;
  
  if (!fee_earner || !booking_date || !booking_time || !duration || !reason || !spaceType) {
    return res.status(400).json({ error: "Missing required booking fields." });
  }
  
  if (!["Boardroom", "Soundproof Pod"].includes(spaceType)) {
    return res.status(400).json({ error: "Invalid spaceType. Must be 'Boardroom' or 'Soundproof Pod'." });
  }
  
  const tableName = spaceType === "Boardroom" ? "boardroom_bookings" : "soundproofpod_bookings";
  
  try {
    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({ error: 'Could not retrieve database credentials' });
    }

    const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

    // Insert into SQL
    const result = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('FeeEarner', sql.NVarChar, fee_earner)
        .input('BookingDate', sql.Date, booking_date)
        .input('BookingTime', sql.Time, new Date(`1970-01-01T${booking_time}Z`))
        .input('Duration', sql.Decimal(10, 2), duration)
        .input('Reason', sql.NVarChar, reason)
        .query(`
          INSERT INTO [dbo].[${tableName}]
            ([fee_earner], [booking_date], [booking_time], [duration], [reason], [created_at], [updated_at])
          VALUES
            (@FeeEarner, @BookingDate, @BookingTime, @Duration, @Reason, GETDATE(), GETDATE());
          SELECT SCOPE_IDENTITY() AS InsertedId;
        `)
    );
    
    const insertedId = result.recordset[0]?.InsertedId;
    console.log(`[book-space] Created booking ID ${insertedId} for ${fee_earner}`);
    
    // Create Clio calendar event (non-blocking)
    try {
      const accessToken = await getClioAccessToken();
      await createClioCalendarEvent(accessToken, { fee_earner, booking_date, booking_time, duration, reason, spaceType });
      console.log(`[book-space] Created Clio calendar event for booking ${insertedId}`);
    } catch (clioError) {
      console.warn(`[book-space] Failed to create Clio calendar event: ${clioError.message}`);
      // Continue - SQL insert succeeded
    }
    
    res.status(201).json({
      message: "Booking created successfully.",
      insertedId,
    });

    // Clear future bookings cache and notify other clients
    try {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = generateCacheKey('metrics', 'future-bookings', today);
      try { await deleteCache(cacheKey); } catch { /* ignore */ }
      try { await deleteCachePattern('metrics:future-bookings*'); } catch { /* ignore */ }
      try {
        broadcastFutureBookingsChanged({ changeType: 'created', spaceType, id: String(insertedId || '') });
      } catch { /* ignore */ }
    } catch {
      // Non-blocking
    }
  } catch (error) {
    console.error('[book-space] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      params: { fee_earner, booking_date, booking_time, duration, reason, spaceType }
    });
    res.status(500).json({ error: `Error creating booking: ${error.message}` });
  }
});

// DELETE /api/book-space/:spaceType/:id - Delete a space booking
router.delete('/:spaceType/:id', async (req, res) => {
  const { spaceType, id } = req.params;
  
  if (!["Boardroom", "Soundproof Pod"].includes(spaceType)) {
    return res.status(400).json({ error: "Invalid spaceType. Must be 'Boardroom' or 'Soundproof Pod'." });
  }
  
  const tableName = spaceType === "Boardroom" ? "boardroom_bookings" : "soundproofpod_bookings";
  
  try {
    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({ error: 'Could not retrieve database credentials' });
    }

    const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

    // Delete from SQL
    const result = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('Id', sql.Int, parseInt(id))
        .query(`
          DELETE FROM [dbo].[${tableName}]
          WHERE [id] = @Id;
          SELECT @@ROWCOUNT AS DeletedRows;
        `)
    );
    
    const deletedRows = result.recordset[0]?.DeletedRows || 0;
    
    if (deletedRows === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    
    console.log(`[book-space] Deleted booking ID ${id} from ${spaceType}`);
    
    res.status(200).json({
      message: "Booking deleted successfully.",
      deletedId: parseInt(id),
    });

    // Clear future bookings cache and notify other clients
    try {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = generateCacheKey('metrics', 'future-bookings', today);
      try { await deleteCache(cacheKey); } catch { /* ignore */ }
      try { await deleteCachePattern('metrics:future-bookings*'); } catch { /* ignore */ }
      try {
        broadcastFutureBookingsChanged({ changeType: 'deleted', spaceType, id: String(id) });
      } catch { /* ignore */ }
    } catch {
      // Non-blocking
    }
  } catch (error) {
    console.error('[book-space] Delete error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      params: { spaceType, id }
    });
    res.status(500).json({ error: `Error deleting booking: ${error.message}` });
  }
});

module.exports = router;
