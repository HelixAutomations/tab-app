const express = require('express');
const { sql, withRequest } = require('../utils/db');
const axios = require('axios');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { getRedisClient, generateCacheKey, cacheWrapper, deleteCachePattern, deleteCache } = require('../utils/redisClient');
const router = express.Router();

const TRANSIENT_SQL_CODES = new Set(['ESOCKET', 'ECONNCLOSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT']);
const DEFAULT_ATTENDANCE_RETRIES = Number(process.env.SQL_ATTENDANCE_MAX_RETRIES || 4);
const FORCE_REFRESH_LOCK_TTL_SECONDS = Number(process.env.ANNUAL_LEAVE_REFRESH_LOCK_TTL_SECONDS || 120);

const isTransientSqlError = (error) => {
  const code = error?.code || error?.originalError?.code || error?.cause?.code;
  if (code && TRANSIENT_SQL_CODES.has(String(code))) {
    return true;
  }
  const message = error?.message || error?.originalError?.message || '';
  return typeof message === 'string' && /ECONNRESET|ECONNCLOSED|ETIMEOUT|ETIMEDOUT/i.test(message);
};

const attendanceQuery = (connectionString, executor, retries = DEFAULT_ATTENDANCE_RETRIES) =>
  withRequest(connectionString, executor, retries);

const getTodayIso = () => new Date().toISOString().split('T')[0];

async function acquireAnnualLeaveRefreshLock(today) {
  const lockKey = generateCacheKey('attendance', 'annual-leave-refresh-lock', today);
  try {
    const redisClient = await getRedisClient();
    if (!redisClient) {
      return { acquired: true, release: async () => {} };
    }

    const result = await redisClient.set(lockKey, String(Date.now()), { NX: true, EX: FORCE_REFRESH_LOCK_TTL_SECONDS });
    if (result !== 'OK') {
      return { acquired: false, skipReason: 'refresh-already-running' };
    }

    return {
      acquired: true,
      release: async () => {
        try {
          await redisClient.del(lockKey);
        } catch (releaseError) {
          // Lock release failed, not critical
        }
      }
    };
  } catch (lockError) {
    // Lock acquisition failed, continue without lock
    return { acquired: true, release: async () => {} };
  }
}

async function getAnnualLeaveDataWithForceControl(today, forceRefreshRequested) {
  let lockContext = null;
  let effectiveForceRefresh = forceRefreshRequested;
  let skippedReason = null;

  if (forceRefreshRequested) {
    lockContext = await acquireAnnualLeaveRefreshLock(today);
    if (!lockContext?.acquired) {
      effectiveForceRefresh = false;
      skippedReason = lockContext?.skipReason || 'refresh-already-running';
    }
  }

  try {
    const data = await getGeneralAnnualLeaveData(today, { forceRefresh: effectiveForceRefresh });
    return {
      data,
      metadata: {
        requestedForceRefresh: forceRefreshRequested,
        executedForceRefresh: effectiveForceRefresh,
        skippedForceRefreshReason: skippedReason
      }
    };
  } finally {
    if (lockContext?.acquired && typeof lockContext.release === 'function') {
      await lockContext.release();
    }
  }
}

async function getGeneralAnnualLeaveData(today, { forceRefresh = false } = {}) {
  const cacheKey = generateCacheKey('attendance', 'annual-leave-general', today);

  if (forceRefresh) {
    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      // Cache clear failed, continue anyway
    }
  }

  return cacheWrapper(
    cacheKey,
    async () => {
      const password = await getSqlPassword();
      if (!password) {
        throw new Error('Could not retrieve database credentials');
      }

      const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
      const coreDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

      const [currentLeaveResult, futureLeaveResult, allLeaveResult, teamResult] = await Promise.all([
        attendanceQuery(projectDataConnStr, (reqSql, s) =>
          reqSql.input('today', s.Date, today).query(`
            SELECT 
              request_id,
              fe AS person,
              start_date,
              end_date,
              reason,
              status,
              days_taken,
              leave_type,
              rejection_notes,
              hearing_confirmation,
              hearing_details,
              half_day_start,
              half_day_end
            FROM [dbo].[annualLeave]
            WHERE status = 'booked'
              AND @today BETWEEN start_date AND end_date
            ORDER BY fe
          `)
        ),
        attendanceQuery(projectDataConnStr, (reqSql, s) =>
          reqSql.input('today', s.Date, today).query(`
            SELECT 
              request_id,
              fe AS person,
              start_date,
              end_date,
              reason,
              status,
              days_taken,
              leave_type,
              rejection_notes,
              hearing_confirmation,
              hearing_details,
              half_day_start,
              half_day_end
            FROM [dbo].[annualLeave]
            WHERE start_date > @today
              AND status IN ('requested', 'approved', 'booked')
            ORDER BY start_date, fe
          `)
        ),
        attendanceQuery(projectDataConnStr, (reqSql) =>
          reqSql.query(`
            SELECT 
              request_id,
              fe AS person,
              start_date,
              end_date,
              reason,
              status,
              days_taken,
              leave_type,
              rejection_notes,
              hearing_confirmation,
              hearing_details,
              half_day_start,
              half_day_end
            FROM [dbo].[annualLeave]
            WHERE start_date >= DATEADD(year, -2, GETDATE())
            ORDER BY start_date DESC
          `)
        ),
        attendanceQuery(coreDataConnStr, (reqSql) =>
          reqSql.query(`
            SELECT Initials, AOW, holiday_entitlement 
            FROM [dbo].[team]
            WHERE status = 'Active'
          `)
        )
      ]);

      return {
        annual_leave: currentLeaveResult.recordset,
        future_leave: futureLeaveResult.recordset,
        all_data: allLeaveResult.recordset,
        team: teamResult.recordset
      };
    },
    1800
  );
}

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Attendance router is working!' });
});

// Debug route to inspect team table schema
router.get('/debug-team-schema', async (req, res) => {
  try {
    // Get column information for both team and attendance tables
  const teamSchemaResult = await attendanceQuery(process.env.SQL_CONNECTION_STRING, (req) =>
      req.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'team'
        ORDER BY ORDINAL_POSITION
      `)
    );
    
  const attendanceSchemaResult = await attendanceQuery(process.env.SQL_CONNECTION_STRING, (req) =>
      req.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Attendance'
        ORDER BY ORDINAL_POSITION
      `)
    );

    res.json({
      success: true,
      team_columns: teamSchemaResult.recordset,
      attendance_columns: attendanceSchemaResult.recordset
    });

  } catch (error) {
    console.error('Error inspecting schemas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// (getSqlPassword is defined later for all routes; keep a single definition to avoid confusion)

// Helper function to check annual leave
async function checkAnnualLeave() {
  try {
    // Cache key based on current date since leave status changes daily
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('attendance', 'annual-leave-active', today);
    
    return await cacheWrapper(
      cacheKey,
      async () => {
        const password = await getSqlPassword();
        if (!password) {
          return new Set();
        }

        // Connection to helix-project-data for annual leave
        const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

        // Get people currently on approved annual leave
        const leaveResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
          req.input('today', sql.Date, today)
            .query(`
            SELECT fe AS person
            FROM annualLeave 
            WHERE status = 'booked'
            AND @today BETWEEN start_date AND end_date
          `)
        );
        
        // Prepare a serializable list of initials currently on leave
        const peopleOnLeaveInitials = [];
        leaveResult.recordset.forEach(row => {
          if (row.person) peopleOnLeaveInitials.push(row.person);
        });
        
        return peopleOnLeaveInitials;
      },
      600 // 10 minutes TTL - annual leave doesn't change frequently during the day
    );
    
  } catch (error) {
    console.error('Error checking annual leave:', error);
    return new Set(); // Return empty set on error
  }
}

// Get attendance data for team with annual leave integration
// Support both GET and POST for flexibility
const getAttendanceHandler = async (req, res) => {
  try {
    // Generate cache key based on current date (attendance changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('attendance', 'team-data', today);
    
    // Try to get cached data first
    const cachedData = await cacheWrapper(
      cacheKey,
      async () => {
        const password = await getSqlPassword();
        if (!password) {
          throw new Error('Could not retrieve database credentials');
        }
        
        const coreDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
        
        // Get current attendance data from the correct attendance table
        const result = await attendanceQuery(coreDataConnStr, (req) => req.query(`
          WITH LatestAttendance AS (
            SELECT 
              [First_Name] AS First,
              [Initials],
              [Level],
              [Week_Start],
              [Week_End],
              [ISO_Week] AS iso,
              [Attendance_Days] AS Status,
              [Confirmed_At],
              ROW_NUMBER() OVER (
                PARTITION BY [Initials], [ISO_Week] 
                ORDER BY [Confirmed_At] DESC
              ) as rn
            FROM [dbo].[attendance]
            WHERE [Week_Start] <= CAST(GETDATE() AS DATE) 
              AND [Week_End] >= CAST(GETDATE() AS DATE)
              AND [Initials] IS NOT NULL
          )
          SELECT First, Initials, Level, Week_Start, Week_End, iso, Status, Confirmed_At
          FROM LatestAttendance
          WHERE rn = 1
          ORDER BY Initials
        `));

        // Get team roster data from the correct team table
        const teamResult = await attendanceQuery(coreDataConnStr, (req) => req.query(`
          SELECT 
            [First],
            [Initials],
            [Entra ID],
            [Nickname]
          FROM [dbo].[team]
          WHERE [status] <> 'inactive'
          ORDER BY [First]
        `));

        // Check who's on annual leave
  const peopleOnLeaveList = await checkAnnualLeave();
  const peopleOnLeave = new Set(Array.isArray(peopleOnLeaveList) ? peopleOnLeaveList : []);
        
        // Transform attendance results to include leave status
        const attendanceWithLeave = result.recordset.map(record => {
          // Use initials directly from attendance table (no need to find from team)
          const initials = record.Initials || '';
          const isOnLeave = peopleOnLeave.has(initials);
          
          return {
            First: record.First,
            Initials: initials,
            Status: isOnLeave ? 'away' : record.Status, // Override status if on leave
            Level: record.Level,
            IsOnLeave: isOnLeave ? 1 : 0,
            Week_Start: record.Week_Start,
            Week_End: record.Week_End,
            iso: record.iso,
            Confirmed_At: record.Confirmed_At
          };
        });

        // Transform team data to match expected format
        const teamData = teamResult.recordset.map(record => ({
          First: record.First,
          Initials: record.Initials,
          'Entra ID': record['Entra ID'],
          Nickname: record.Nickname || record.First,
          // Add leave status for team members
          IsOnLeave: peopleOnLeave.has(record.Initials) ? 1 : 0,
          // Add status from attendance if available
          Status: (() => {
            const attendanceRecord = attendanceWithLeave.find(a => a.Initials === record.Initials);
            return attendanceRecord?.Status || '';
          })()
        }));

        return {
          attendance: attendanceWithLeave,
          team: teamData
        };
      },
      300 // 5 minutes TTL - attendance data changes frequently but not constantly
    );

    res.json({
      success: true,
      ...cachedData
    });

  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

router.post('/getAttendance', getAttendanceHandler);
router.get('/getAttendance', getAttendanceHandler);

// Removed duplicate older '/getAnnualLeave' route that omitted hearing fields; the enhanced version remains below

// Update attendance data
router.post('/updateAttendance', async (req, res) => {
  try {
    const { initials, weekStart, attendanceDays } = req.body;
    
    if (!initials || !weekStart || !attendanceDays) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: initials, weekStart, attendanceDays'
      });
    }
    
    const password = await getSqlPassword();
    if (!password) {
      throw new Error('Could not retrieve database credentials');
    }
    
    const coreDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
    
    // Calculate week end date
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    // Calculate ISO week number
    const getISOWeek = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      const week1 = new Date(d.getFullYear(), 0, 4);
      return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };
    
    const isoWeek = getISOWeek(new Date(weekStart));

    // Get user's full name from team data (or use existing if available)
  const teamResult = await attendanceQuery(coreDataConnStr, (req, sql) =>
      req.input('initials', sql.VarChar(10), initials)
        .query(`SELECT First FROM [dbo].[team] WHERE Initials = @initials`)
    );
    
    const firstName = teamResult.recordset[0]?.First || 'Unknown';

    // Get or generate Entry_ID - check if record exists first
    let entryId;
  const existingResult = await attendanceQuery(coreDataConnStr, (req, sql) =>
      req.input('initials', sql.VarChar(10), initials)
        .input('weekStart', sql.Date, weekStart)
        .query(`
          SELECT Entry_ID FROM Attendance 
          WHERE Initials = @initials AND Week_Start = @weekStart
        `)
    );
    
    if (existingResult.recordset.length > 0) {
      entryId = existingResult.recordset[0].Entry_ID;
    } else {
      // Generate new Entry_ID - get next available ID
  const nextIdResult = await attendanceQuery(coreDataConnStr, (req) =>
        req.query(`SELECT ISNULL(MAX(Entry_ID), 0) + 1 AS NextId FROM Attendance`)
      );
      entryId = nextIdResult.recordset[0].NextId;
    }

    // Upsert the attendance record with Entry_ID
  const result = await attendanceQuery(coreDataConnStr, (req, sql) =>
      req.input('entryId', sql.Int, entryId)
        .input('firstName', sql.VarChar(100), firstName)
        .input('initials', sql.VarChar(10), initials)
        .input('weekStart', sql.Date, weekStart)
        .input('weekEnd', sql.Date, weekEndStr)
        .input('isoWeek', sql.Int, isoWeek)
        // Use MAX to accommodate any pattern length safely
        .input('attendanceDays', sql.VarChar(sql.MAX), attendanceDays)
        .query(`
          MERGE Attendance AS target
          USING (VALUES (@entryId, @firstName, @initials, @weekStart, @weekEnd, @isoWeek, @attendanceDays, GETDATE()))
            AS source (Entry_ID, First_Name, Initials, Week_Start, Week_End, ISO_Week, Attendance_Days, Confirmed_At)
          ON (target.Initials = source.Initials AND target.Week_Start = source.Week_Start)
          WHEN MATCHED THEN
            UPDATE SET 
              Entry_ID = source.Entry_ID,
              First_Name = source.First_Name,
              Attendance_Days = source.Attendance_Days,
              Confirmed_At = source.Confirmed_At
          WHEN NOT MATCHED THEN
            INSERT (Entry_ID, First_Name, Initials, Week_Start, Week_End, ISO_Week, Attendance_Days, Confirmed_At)
            VALUES (source.Entry_ID, source.First_Name, source.Initials, source.Week_Start, source.Week_End, source.ISO_Week, source.Attendance_Days, source.Confirmed_At);
        `)
    );

    // Get the updated record
  const updatedResult = await attendanceQuery(process.env.SQL_CONNECTION_STRING, (req, sql) =>
      req.input('initials', sql.VarChar(10), initials)
        .input('weekStart', sql.Date, weekStart)
        .query(`
          SELECT 
            Attendance_ID,
            Entry_ID,
            First_Name,
            Initials,
            '' as Level,
            Week_Start,
            Week_End,
            ISO_Week,
            Attendance_Days,
            Confirmed_At
          FROM Attendance
          WHERE Initials = @initials AND Week_Start = @weekStart
        `)
    );

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      record: updatedResult.recordset[0]
    });

    // Clear attendance cache after successful update
    try {
      await deleteCachePattern('attendance:*');
    } catch (cacheError) {
      // Cache clear failed, not critical
    }

  } catch (error) {
    console.error('Error updating attendance:', error.message || error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== ANNUAL LEAVE ROUTES =====

// Helper function to get SQL password from Key Vault with Redis and in-memory cache
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
      // Try Redis cache first for distributed caching
      const redisCacheKey = generateCacheKey('attendance', 'sql-password');
      try {
        const redisClient = await getRedisClient();
        if (redisClient) {
          const cachedPwd = await redisClient.get(redisCacheKey);
          if (cachedPwd) {
            cachedSqlPassword = cachedPwd;
            sqlPasswordExpiry = Date.now() + 60 * 60 * 1000; // 1h TTL
            return cachedSqlPassword;
          }
        }
      } catch (redisError) {
        // Redis unavailable, fetch from Key Vault
      }

      // Fetch from Key Vault
      const kvUri = "https://helix-keys.vault.azure.net/";
      const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
      const secretClient = new SecretClient(kvUri, credential);
      const secret = await secretClient.getSecret("sql-databaseserver-password");
      cachedSqlPassword = secret.value;
      sqlPasswordExpiry = Date.now() + 60 * 60 * 1000; // 1 hour cache

      // Store in Redis for distributed caching
      try {
        const redisClient = await getRedisClient();
        if (redisClient) {
          await redisClient.setEx(redisCacheKey, 3600, cachedSqlPassword); // 1h TTL
        }
      } catch (redisError) {
        // Redis cache write failed, continue
      }

      return cachedSqlPassword;
    } catch (error) {
      console.error('Error getting SQL password from Key Vault:', error);
      // Keep any existing cached value if present; otherwise null
      return cachedSqlPassword;
    } finally {
      sqlPasswordPromise = null;
    }
  })();

  return sqlPasswordPromise;
}

// Helper function to get Clio secrets from Key Vault
async function getClioSecrets() {
  try {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
    const secretClient = new SecretClient(kvUri, credential);
    
    const [clientIdSecret, clientSecretObj, refreshTokenSecret] = await Promise.all([
      secretClient.getSecret("clio-calendars-clientid"),
      secretClient.getSecret("clio-calendars-secret"),
      secretClient.getSecret("clio-calendars-refreshtoken")
    ]);

    return {
      clientId: clientIdSecret.value || "",
      clientSecret: clientSecretObj.value || "",
      refreshToken: refreshTokenSecret.value || ""
    };
  } catch (error) {
    console.error('Error getting Clio secrets from Key Vault:', error);
    return null;
  }
}

// Helper function to get Clio access token
async function getClioAccessToken(clioSecrets) {
  const tokenUrl = "https://eu.app.clio.com/oauth/token";

  const data = {
    client_id: clioSecrets.clientId,
    client_secret: clioSecrets.clientSecret,
    grant_type: "refresh_token",
    refresh_token: clioSecrets.refreshToken
  };

  try {
    const response = await axios.post(tokenUrl, new URLSearchParams(data).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error obtaining Clio access token:', error);
    return null;
  }
}

// GET /api/attendance/annual-leave - Get all annual leave data
router.post('/getAnnualLeave', async (req, res) => {
  const { userInitials } = req.body;
  const forceRefresh = String(req.query?.forceRefresh || '').toLowerCase() === 'true';
  const today = getTodayIso();
  let refreshMetadata = {
    requestedForceRefresh: forceRefresh,
    executedForceRefresh: false,
    skippedForceRefreshReason: null
  };

  try {

    // Get cached or fresh general annual leave data
    const { data: generalLeaveData, metadata } = await getAnnualLeaveDataWithForceControl(today, forceRefresh);
    refreshMetadata = metadata;

    // Handle user-specific data (not cached since it's user-specific and varies per request)
    let userDetails = { leaveEntries: [], totals: { standard: 0, unpaid: 0, sale: 0, rejected: 0 } };

    if (userInitials) {
      const fiscalStart = getFiscalYearStart(new Date());
      const fiscalEnd = new Date(fiscalStart.getFullYear() + 1, 2, 31);
      const normalizedInitials = String(userInitials).trim().toUpperCase();
      const allEntries = Array.isArray(generalLeaveData?.all_data) ? generalLeaveData.all_data : null;

      if (allEntries) {
        const filteredEntries = allEntries.filter((entry) => {
          const entryInitials = String(entry.person || entry.fe || entry.initials || '').trim().toUpperCase();
          if (!entryInitials || entryInitials !== normalizedInitials) {
            return false;
          }

          const startDate = entry.start_date ? new Date(entry.start_date) : null;
          const endDate = entry.end_date ? new Date(entry.end_date) : null;
          if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
            return false;
          }

          return startDate >= fiscalStart && endDate <= fiscalEnd;
        });

        const totals = filteredEntries.reduce(
          (acc, entry) => {
            const days = Number(entry.days_taken) || 0;
            const status = String(entry.status || '').toLowerCase();
            const leaveType = String(entry.leave_type || '').toLowerCase();

            if (status === 'rejected') {
              acc.rejected += days;
              return acc;
            }

            // Count approved and booked leave toward totals
            if (status === 'booked' || status === 'approved') {
              if (leaveType === 'standard') {
                acc.standard += days;
              } else if (leaveType === 'purchase') {
                acc.unpaid += days;
              } else if (leaveType === 'sale') {
                acc.sale += days;
              }
            }

            return acc;
          },
          { standard: 0, unpaid: 0, sale: 0, rejected: 0 }
        );

        userDetails = { leaveEntries: filteredEntries, totals };
      } else {
        // Fallback to direct query if cached general data couldn't be retrieved
        const password = await getSqlPassword();
        if (!password) {
          throw new Error('Could not retrieve database credentials');
        }

        const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
        const fiscalStartStr = fiscalStart.toISOString().split('T')[0];
        const fiscalEndStr = fiscalEnd.toISOString().split('T')[0];

        const userLeaveResult = await attendanceQuery(projectDataConnStr, (reqSql, s) =>
          reqSql
            .input('initials', s.VarChar(10), userInitials)
            .input('fiscalStart', s.Date, fiscalStartStr)
            .input('fiscalEnd', s.Date, fiscalEndStr)
            .query(`
              SELECT 
                request_id,
                fe AS person,
                start_date,
                end_date,
                reason,
                status,
                days_taken,
                leave_type,
                rejection_notes,
                hearing_confirmation,
                hearing_details
              FROM [dbo].[annualLeave]
              WHERE fe = @initials
                AND start_date >= @fiscalStart 
                AND end_date <= @fiscalEnd
              ORDER BY start_date DESC
            `)
        );

        const totals = userLeaveResult.recordset.reduce(
          (acc, entry) => {
            const days = entry.days_taken || 0;
            const status = String(entry.status || '').toLowerCase();
            const leaveType = String(entry.leave_type || '').toLowerCase();
            
            if (status === 'rejected') {
              acc.rejected += days;
            } else if (status === 'booked' || status === 'approved') {
              // Count approved and booked leave toward totals
              if (leaveType === 'standard') {
                acc.standard += days;
              } else if (leaveType === 'purchase') {
                acc.unpaid += days;
              } else if (leaveType === 'sale') {
                acc.sale += days;
              }
            }
            return acc;
          },
          { standard: 0, unpaid: 0, sale: 0, rejected: 0 }
        );

        userDetails = { leaveEntries: userLeaveResult.recordset, totals };
      }
    }

    res.json({
      success: true,
      ...generalLeaveData,
      user_details: userDetails,
      user_leave: userDetails.leaveEntries,
      refresh: refreshMetadata
    });

  } catch (error) {
    console.error('Error fetching annual leave:', error);
    const emptyUserDetails = { leaveEntries: [], totals: { standard: 0, unpaid: 0, sale: 0, rejected: 0 } };
    const fallbackPayload = {
      success: false,
      error: 'Failed to fetch annual leave data',
      annual_leave: [],
      future_leave: [],
      user_details: emptyUserDetails,
      all_data: [],
      team: [],
      refresh: {
        ...refreshMetadata,
        skippedForceRefreshReason: refreshMetadata.skippedForceRefreshReason || 'failed-before-response'
      }
    };

    if (isTransientSqlError(error)) {
      return res.status(200).json({ ...fallbackPayload, transient: true });
    }

    res.status(500).json(fallbackPayload);
  }
});

// POST /api/attendance/annual-leave - Insert new annual leave request
router.post('/annual-leave', async (req, res) => {
  try {
    const { fe, dateRanges, reason, days_taken, leave_type, hearing_confirmation, hearing_details } = req.body;

    // Validate required fields
    if (!fe || !Array.isArray(dateRanges) || dateRanges.length === 0 || !leave_type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fe, dateRanges, or leave_type"
      });
    }

    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve database credentials'
      });
    }

    const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

    const insertedIds = [];
    
    // Insert each date range as a separate record
    for (const range of dateRanges) {
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);
      
      // Calculate actual days considering half-days
      let computedDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (range.half_day_start) computedDays -= 0.5;
      if (range.half_day_end) computedDays -= 0.5;
      
      const result = await attendanceQuery(projectDataConnStr, (req, sql) =>
        req.input('fe', sql.VarChar(50), fe)
          .input('start_date', sql.Date, range.start_date)
          .input('end_date', sql.Date, range.end_date)
          .input('reason', sql.NVarChar(sql.MAX), reason || "No reason provided.")
          .input('status', sql.VarChar(50), "requested")
          .input('days_taken', sql.Float, computedDays)
          .input('leave_type', sql.VarChar(50), leave_type)
          .input('hearing_confirmation', sql.Bit, hearing_confirmation?.toLowerCase() === "yes" ? 1 : 0)
          .input('hearing_details', sql.NVarChar(sql.MAX), hearing_details || "")
          .input('half_day_start', sql.Bit, range.half_day_start ? 1 : 0)
          .input('half_day_end', sql.Bit, range.half_day_end ? 1 : 0)
          .query(`
            INSERT INTO [dbo].[annualLeave] 
              ([fe], [start_date], [end_date], [reason], [status], [days_taken], [leave_type], [hearing_confirmation], [hearing_details], [half_day_start], [half_day_end])
            VALUES 
              (@fe, @start_date, @end_date, @reason, @status, @days_taken, @leave_type, @hearing_confirmation, @hearing_details, @half_day_start, @half_day_end);
            SELECT SCOPE_IDENTITY() AS InsertedId;
          `)
      );
      
      insertedIds.push(result.recordset[0].InsertedId);
    }

    res.status(201).json({
      success: true,
      message: "Annual leave entries created successfully.",
      insertedIds
    });

    // Clear annual leave cache after successful creation
    try {
      await deleteCachePattern('attendance:annual-leave*');
    } catch (cacheError) {
      // Cache clear failed, not critical
    }

  } catch (error) {
    console.error('Error inserting annual leave:', error.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert annual leave request'
    });
  }
});

// PUT /api/attendance/annual-leave/:id - Update annual leave status
router.post('/updateAnnualLeave', async (req, res) => {
  try {
    const { id, newStatus, rejection_notes } = req.body;

    if (!id || !newStatus) {
      return res.status(400).json({
        success: false,
        error: "Missing 'id' or 'newStatus' in request body."
      });
    }
    
    // Validate ID is a valid number
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      console.error('❌ Invalid ID format:', { id, parsedId });
      return res.status(400).json({
        success: false,
        error: `Invalid ID format: '${id}'. Expected a numeric value.`
      });
    }

    // Validate status
    const allowedStatuses = ['requested', 'approved', 'booked', 'rejected', 'acknowledged', 'discarded'];
    if (!allowedStatuses.includes(newStatus.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'newStatus'. Allowed statuses are: ${allowedStatuses.join(', ')}.`
      });
    }

    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve database credentials'
      });
    }

    const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

    // Update the record
    const updateResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('id', sql.Int, parsedId)
        .input('newStatus', sql.VarChar(50), newStatus)
        .input('rejectionNotes', sql.NVarChar(sql.MAX), rejection_notes || "")
        .query(`
          UPDATE [dbo].[annualLeave]
             SET [status] = @newStatus,
                 [rejection_notes] = CASE 
                                       WHEN @newStatus = 'rejected' AND (@rejectionNotes IS NOT NULL AND @rejectionNotes <> '')
                                       THEN @rejectionNotes 
                                       ELSE [rejection_notes] 
                                     END
           WHERE [request_id] = @id;
        `)
    );

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: `No record found with ID ${id}, or the status transition is invalid.`
      });
    }

    // If newStatus is 'booked', create Clio calendar entry
    if (newStatus.toLowerCase() === 'booked') {
      try {
        // Fetch the leave record details including half-day flags
        const leaveResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
          req.input('id', sql.Int, parseInt(id, 10))
            .query(`
              SELECT fe, start_date, end_date, ClioEntryId, half_day_start, half_day_end
              FROM [dbo].[annualLeave]
              WHERE request_id = @id
            `)
        );

        const leaveRecord = leaveResult.recordset[0];
        
        if (leaveRecord && !leaveRecord.ClioEntryId) {
          // Get Clio secrets and create calendar entry
          const clioSecrets = await getClioSecrets();
          if (clioSecrets) {
            const accessToken = await getClioAccessToken(clioSecrets);
            if (accessToken) {
              const clioEntryId = await createClioCalendarEntry(
                accessToken,
                leaveRecord.fe,
                leaveRecord.start_date,
                leaveRecord.end_date,
                leaveRecord.half_day_start,
                leaveRecord.half_day_end
              );

              // Update the SQL record with the Clio entry ID
              if (clioEntryId) {
                await attendanceQuery(projectDataConnStr, (req, sql) =>
                  req.input('id', sql.Int, parseInt(id, 10))
                    .input('clioEntryId', sql.Int, clioEntryId)
                    .query(`
                      UPDATE [dbo].[annualLeave]
                         SET [ClioEntryId] = @clioEntryId
                       WHERE [request_id] = @id;
                    `)
                );
              }
            }
          }
        }
      } catch (clioError) {
        console.error('Error creating Clio calendar entry:', clioError);
        // Continue with the response even if Clio fails
      }
    }

    res.json({
      success: true,
      message: `Annual leave ID ${id} updated to status '${newStatus}'.`
    });

    // Clear annual leave cache after successful update
    try {
      await deleteCachePattern('attendance:annual-leave*');
    } catch (cacheError) {
      // Cache clear failed, not critical
    }

  } catch (error) {
    console.error('Error updating annual leave:', error.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to update annual leave status'
    });
  }
});

// GET /api/attendance/annual-leave-all - Get all annual leave data for reporting
router.get('/annual-leave-all', async (req, res) => {
  try {
    const forceRefresh = String(req.query?.forceRefresh || '').toLowerCase() === 'true';
    const today = getTodayIso();
    const { data: generalLeaveData, metadata: refreshMetadata } = await getAnnualLeaveDataWithForceControl(today, forceRefresh);

    res.json({
      success: true,
      all_data: generalLeaveData.all_data,
      annual_leave: generalLeaveData.annual_leave,
      future_leave: generalLeaveData.future_leave,
      team: generalLeaveData.team,
      refresh: refreshMetadata
    });

  } catch (error) {
    console.error('Error fetching all annual leave:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch annual leave data'
    });
  }
});

// Helper function to create Clio calendar entry
// half_day_start: true means start day is PM only (from 1pm)
// half_day_end: true means end day is AM only (until 1pm)
async function createClioCalendarEntry(accessToken, fe, startDate, endDate, halfDayStart = false, halfDayEnd = false) {
  const calendarUrl = "https://eu.app.clio.com/api/v4/calendar_entries.json";
  const calendarId = 152290;

  const summary = `${fe} A/L`;
  
  const startDateObject = new Date(startDate);
  const endDateObject = new Date(endDate);
  
  // Check if it's a single-day half-day request
  const isSingleDay = startDateObject.toDateString() === endDateObject.toDateString();
  const isHalfDay = halfDayStart || halfDayEnd;
  
  let data;
  
  if (isHalfDay && isSingleDay) {
    // Single day half-day: set specific times
    // halfDayEnd = AM (morning only, 9am-1pm)
    // halfDayStart = PM (afternoon only, 1pm-5pm)
    const startHour = halfDayStart ? 13 : 9; // PM starts at 1pm, AM starts at 9am
    const endHour = halfDayEnd ? 13 : 17;     // AM ends at 1pm, PM ends at 5pm
    
    startDateObject.setUTCHours(startHour, 0, 0, 0);
    endDateObject.setUTCHours(endHour, 0, 0, 0);
    
    data = {
      data: {
        all_day: false,
        calendar_owner: { id: calendarId },
        start_at: startDateObject.toISOString(),
        end_at: endDateObject.toISOString(),
        summary: `${summary} (${halfDayStart ? 'PM' : 'AM'})`,
        send_email_notification: false
      }
    };
  } else if (isHalfDay) {
    // Multi-day range with half-day start/end
    // For Clio, we'll note it in the summary since all_day doesn't support partial days well
    if (halfDayStart) {
      startDateObject.setUTCHours(13, 0, 0, 0); // Start at 1pm
    }
    if (halfDayEnd) {
      endDateObject.setUTCHours(13, 0, 0, 0); // End at 1pm
    } else {
      // Full end day - set to next day for exclusive end
      endDateObject.setUTCDate(endDateObject.getUTCDate() + 1);
    }
    
    const suffix = [];
    if (halfDayStart) suffix.push('starts PM');
    if (halfDayEnd) suffix.push('ends AM');
    
    data = {
      data: {
        all_day: !halfDayStart && !halfDayEnd, // Only all_day if no half-days
        calendar_owner: { id: calendarId },
        start_at: startDateObject.toISOString(),
        end_at: endDateObject.toISOString(),
        summary: suffix.length > 0 ? `${summary} (${suffix.join(', ')})` : summary,
        send_email_notification: false
      }
    };
  } else {
    // Full days - original behaviour
    endDateObject.setUTCDate(endDateObject.getUTCDate() + 1); // Make end_at exclusive
    
    data = {
      data: {
        all_day: true,
        calendar_owner: { id: calendarId },
        start_at: startDateObject.toISOString(),
        end_at: endDateObject.toISOString(),
        summary: summary,
        send_email_notification: false
      }
    };
  }

  try {
    const response = await axios.post(calendarUrl, data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (response.status === 201) {
      return parseInt(response.data.data.id, 10);
    }
    return null;
  } catch (error) {
    console.error('Error creating Clio calendar entry:', error);
    return null;
  }
}

// Helper function to get fiscal year start
function getFiscalYearStart(date) {
  const year = date.getFullYear();
  const aprilFirst = new Date(year, 3, 1); // April 1st
  return date >= aprilFirst ? aprilFirst : new Date(year - 1, 3, 1);
}

// Helper function to delete Clio calendar entry
async function deleteClioCalendarEntry(accessToken, clioEntryId) {
  const calendarUrl = `https://eu.app.clio.com/api/v4/calendar_entries/${clioEntryId}.json`;

  try {
    const response = await axios.delete(calendarUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (response.status === 200 || response.status === 204) {
      console.log(`Successfully deleted Clio calendar entry ${clioEntryId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting Clio calendar entry:', error?.response?.data || error.message);
    return false;
  }
}

// DELETE /api/attendance/annual-leave/:id - Delete an annual leave record
router.delete('/annual-leave/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteFromClio = true } = req.body; // Default to deleting from Clio

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing 'id' parameter."
      });
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ID format: '${id}'. Expected a numeric value.`
      });
    }

    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve database credentials'
      });
    }

    const projectDataConnStr = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-project-data;Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

    // First, fetch the record to get Clio entry ID if it exists
    const fetchResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('id', sql.Int, parsedId)
        .query(`
          SELECT request_id, fe, start_date, end_date, ClioEntryId, status
          FROM [dbo].[annualLeave]
          WHERE request_id = @id
        `)
    );

    if (fetchResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No annual leave record found with ID ${id}.`
      });
    }

    const record = fetchResult.recordset[0];
    let clioDeleted = false;

    // Delete from Clio if requested and there's a Clio entry
    if (deleteFromClio && record.ClioEntryId) {
      try {
        const clioSecrets = await getClioSecrets();
        if (clioSecrets) {
          const accessToken = await getClioAccessToken(clioSecrets);
          if (accessToken) {
            clioDeleted = await deleteClioCalendarEntry(accessToken, record.ClioEntryId);
          }
        }
      } catch (clioError) {
        console.error('Error deleting from Clio:', clioError);
        // Continue with SQL deletion even if Clio fails
      }
    }

    // Delete from SQL database
    const deleteResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('id', sql.Int, parsedId)
        .query(`
          DELETE FROM [dbo].[annualLeave]
          WHERE request_id = @id
        `)
    );

    if (deleteResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: `Failed to delete annual leave record with ID ${id}.`
      });
    }

    console.log(`Deleted annual leave record ${id} (Clio deleted: ${clioDeleted})`);

    res.json({
      success: true,
      message: `Annual leave record deleted successfully.`,
      clioDeleted: record.ClioEntryId ? clioDeleted : null
    });

    // Clear annual leave cache after successful deletion
    try {
      await deleteCachePattern('attendance:annual-leave*');
    } catch (cacheError) {
      // Cache clear failed, not critical
    }

  } catch (error) {
    console.error('Error deleting annual leave:', error.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete annual leave record'
    });
  }
});

module.exports = router;