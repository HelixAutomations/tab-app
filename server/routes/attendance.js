const express = require('express');
const { sql, withRequest } = require('../utils/db');
const axios = require('axios');
const { getClient } = require('../utils/getSecret');
const { getRedisClient, generateCacheKey, cacheWrapper, deleteCachePattern, deleteCache } = require('../utils/redisClient');
const { attachAnnualLeaveStream, broadcastAnnualLeaveChanged } = require('../utils/annual-leave-stream');
const { attachAttendanceStream, broadcastAttendanceChanged } = require('../utils/attendance-stream');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
  archiveSubmission,
} = require('../utils/formSubmissionLog');
const {
  createCard: createHubTodoCard,
  reconcileAllByRef: reconcileHubTodoByRef,
} = require('../utils/hubTodoLog');
const { sendHelixEmail } = require('../utils/helixEmail');
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

const AUTO_BOOK_ANNUAL_LEAVE_USERS = new Set(['AC', 'JW']);

const shouldAutoBookAnnualLeave = (initials) => {
  if (!initials) return false;
  return AUTO_BOOK_ANNUAL_LEAVE_USERS.has(String(initials).trim().toUpperCase());
};

/**
 * Derive annual-leave approver initials (mirrors
 * api/src/functions/getAnnualLeave.ts `determineApprovers`).
 * Construction AoW → JW; everything else → AC. LZ always included.
 */
function determineLeaveApprovers(aow) {
  const list = String(aow || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const isConstruction = list.some((item) => item === 'cs' || item.includes('construction'));
  return ['LZ', isConstruction ? 'JW' : 'AC'];
}

const getTodayIso = () => new Date().toISOString().split('T')[0];

// ── Connection string builder ──
// Keeps the SQL template (Encrypt, MARS, Timeout) in one place so the 11
// previously-duplicated inline strings can't drift. Password must be fetched
// via getSqlPassword() before calling.
const buildAttendanceConnStr = (password, catalog) =>
  `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=${catalog};Persist Security Info=False;User ID=helix-database-server;Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;

const getAttendanceConnectionStrings = (password) => ({
  projectDataConnStr: buildAttendanceConnStr(password, 'helix-project-data'),
  coreDataConnStr: buildAttendanceConnStr(password, 'helix-core-data'),
});

// ── In-memory cache for attendance (avoids Redis round-trip on critical path) ──
const attendanceMemCache = new Map();
// 120s: attendance only changes on explicit /updateAttendance + /confirmAttendance
// paths which already call clearAttendanceMemCached(), so we can hold longer
// without staleness risk. Cuts Home-boot latency for the second tab open.
const ATTENDANCE_MEM_TTL_MS = 120_000;

// ── Singleflight gate for getGeneralAnnualLeaveData ──
// Prevents stampede when /getAttendance and /getAnnualLeave fire concurrently
// on Home boot with a cold Redis cache. Both callers share the same in-flight
// Promise so the underlying 4-query fan-out runs once.
const inFlightGeneralAnnualLeave = new Map();
const getAttendanceMemCached = (key) => {
  const entry = attendanceMemCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ATTENDANCE_MEM_TTL_MS) {
    attendanceMemCache.delete(key);
    return null;
  }
  return entry.data;
};
const setAttendanceMemCached = (key, data) => {
  attendanceMemCache.set(key, { data, timestamp: Date.now() });
};
const clearAttendanceMemCached = (key) => {
  if (key) attendanceMemCache.delete(key);
  else attendanceMemCache.clear();
};

const PAYROLL_NOTIFICATION_LEAVE_TYPES = new Set(['purchase', 'sale']);

function normalizeAnnualLeaveType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'unpaid') return 'purchase';
  return normalized;
}

function shouldSyncAnnualLeaveCalendars(leaveRecord) {
  const status = String(leaveRecord?.status || '').trim().toLowerCase();
  const leaveType = normalizeAnnualLeaveType(leaveRecord?.leave_type);
  return status === 'booked' && leaveType === 'standard';
}

const formatAnnualLeaveDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return value || 'Unknown date';
  }

  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function sendPayrollAnnualLeaveNotification({ req, leaveRecord, effectiveStatus }) {
  const leaveType = String(leaveRecord?.leave_type || '').trim().toLowerCase();
  if (!PAYROLL_NOTIFICATION_LEAVE_TYPES.has(leaveType)) {
    return false;
  }

  if (!['approved', 'booked'].includes(String(effectiveStatus || '').toLowerCase())) {
    return false;
  }

  const startedAt = Date.now();
  const requestId = String(leaveRecord?.request_id || '');
  const operation = 'annual-leave-payroll-email';
  const person = String(leaveRecord?.fe || '').trim() || 'Unknown';
  const daysTaken = Number(leaveRecord?.days_taken);
  const safeDaysTaken = Number.isFinite(daysTaken) ? daysTaken : 0;
  const typeLabel = leaveType === 'sale' ? 'Sale' : 'Purchase';
  const dateRange = formatAnnualLeaveDate(leaveRecord?.start_date) === formatAnnualLeaveDate(leaveRecord?.end_date)
    ? formatAnnualLeaveDate(leaveRecord?.start_date)
    : `${formatAnnualLeaveDate(leaveRecord?.start_date)} - ${formatAnnualLeaveDate(leaveRecord?.end_date)}`;
  const reason = String(leaveRecord?.reason || '').trim();

  trackEvent('Attendance.AnnualLeavePayrollEmail.Started', {
    operation,
    triggeredBy: 'updateAnnualLeave',
    requestId,
    leaveType,
    effectiveStatus: String(effectiveStatus),
    person,
  });

  const subject = `Payroll notification: ${typeLabel.toLowerCase()} annual leave ${String(effectiveStatus).toLowerCase()} for ${person}`;
  const bodyHtml = `
    <div style="font-family: Raleway, Segoe UI, sans-serif; color: #061733;">
      <p>A ${escapeHtml(leaveType)} annual leave request has been ${escapeHtml(String(effectiveStatus).toLowerCase())}.</p>
      <table style="border-collapse: collapse; margin-top: 12px;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Person</strong></td><td style="padding: 4px 0;">${escapeHtml(person)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Type</strong></td><td style="padding: 4px 0;">${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Days</strong></td><td style="padding: 4px 0;">${escapeHtml(String(safeDaysTaken))}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Date${dateRange.includes(' - ') ? 's' : ''}</strong></td><td style="padding: 4px 0;">${escapeHtml(dateRange)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Status</strong></td><td style="padding: 4px 0; text-transform: capitalize;">${escapeHtml(String(effectiveStatus).toLowerCase())}</td></tr>
        ${reason ? `<tr><td style="padding: 4px 12px 4px 0;"><strong>Reason</strong></td><td style="padding: 4px 0;">${escapeHtml(reason)}</td></tr>` : ''}
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Request ID</strong></td><td style="padding: 4px 0;">${escapeHtml(requestId)}</td></tr>
      </table>
    </div>
  `;

  try {
    const emailResult = await sendHelixEmail({
      req,
      route: 'server:/api/attendance/payroll-email',
      body: {
        user_email: 'kw@helix-law.com',
        cc_emails: 'lz@helix-law.com',
        subject,
        email_contents: bodyHtml,
        from_email: 'automations@helix-law.com',
        skip_signature: true,
        contextLabel: 'Attendance payroll annual leave notification',
        source: 'attendance-payroll',
      },
    });

    const durationMs = Date.now() - startedAt;
    if (!emailResult.ok) {
      const emailError = new Error(`Payroll annual leave email failed: ${emailResult.status || 500} ${emailResult.error || ''}`.trim());
      trackException(emailError, {
        operation,
        phase: 'send-email',
        requestId,
        leaveType,
        effectiveStatus: String(effectiveStatus),
        person,
      });
      trackEvent('Attendance.AnnualLeavePayrollEmail.Failed', {
        operation,
        triggeredBy: 'updateAnnualLeave',
        requestId,
        leaveType,
        effectiveStatus: String(effectiveStatus),
        person,
        error: emailError.message,
      });
      return false;
    }

    trackEvent('Attendance.AnnualLeavePayrollEmail.Completed', {
      operation,
      triggeredBy: 'updateAnnualLeave',
      requestId,
      leaveType,
      effectiveStatus: String(effectiveStatus),
      person,
      durationMs: String(durationMs),
    });
    trackMetric('Attendance.AnnualLeavePayrollEmail.Duration', durationMs, {
      operation,
      leaveType,
      effectiveStatus: String(effectiveStatus),
    });
    return true;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error instanceof Error ? error : new Error(String(error?.message || error)), {
      operation,
      phase: 'send-email',
      requestId,
      leaveType,
      effectiveStatus: String(effectiveStatus),
      person,
      durationMs: String(durationMs),
    });
    trackEvent('Attendance.AnnualLeavePayrollEmail.Failed', {
      operation,
      triggeredBy: 'updateAnnualLeave',
      requestId,
      leaveType,
      effectiveStatus: String(effectiveStatus),
      person,
      error: error?.message || String(error),
    });
    return false;
  }
}

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

  // Singleflight gate: when /getAttendance and /getAnnualLeave fire concurrently
  // on Home boot with a cold Redis cache, both used to run the 4-query fan-out
  // independently. Share the in-flight Promise per cache key so only one DB
  // round-trip runs; the second caller awaits the same result.
  const existing = inFlightGeneralAnnualLeave.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = cacheWrapper(
    cacheKey,
    async () => {
      const password = await getSqlPassword();
      if (!password) {
        throw new Error('Could not retrieve database credentials');
      }

      const { projectDataConnStr, coreDataConnStr } = getAttendanceConnectionStrings(password);

      // Single annualLeave read covers all three legacy partitions:
      //   - all_data: start_date within last 2 years
      //   - annual_leave: status='booked' AND today BETWEEN start_date AND end_date
      //     (included explicitly in case the current leave started >2 years ago)
      //   - future_leave: start_date > today AND status IN (requested|approved|booked)
      // Backed by IX_annualLeave_status_dates + IX_annualLeave_start_date
      // (see scripts/migrate-add-attendance-indexes.mjs).
      const [leaveResult, teamResult] = await Promise.all([
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
              half_day_end,
              requested_at,
              approved_at,
              booked_at,
              updated_at
            FROM [dbo].[annualLeave]
            WHERE start_date >= DATEADD(year, -2, GETDATE())
               OR (status = 'booked' AND @today BETWEEN start_date AND end_date)
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

      // Partition in-memory. todayStr lets us do string compare against the
      // ISO date the DB returns (no TZ gymnastics).
      const rows = leaveResult.recordset;
      const toIso = (d) => {
        if (!d) return '';
        if (typeof d === 'string') return d.slice(0, 10);
        const dt = d instanceof Date ? d : new Date(d);
        return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
      };
      const annual_leave = [];
      const future_leave = [];
      const all_data = [];
      const twoYearsAgoMs = Date.now() - (1000 * 60 * 60 * 24 * 365 * 2);
      for (const row of rows) {
        const startIso = toIso(row.start_date);
        const endIso = toIso(row.end_date);
        const startMs = startIso ? Date.parse(startIso) : NaN;
        // all_data: last 2 years
        if (Number.isFinite(startMs) && startMs >= twoYearsAgoMs) {
          all_data.push(row);
        }
        // annual_leave: booked AND today in range
        if (row.status === 'booked' && startIso && endIso && startIso <= today && today <= endIso) {
          annual_leave.push(row);
        }
        // future_leave: starts strictly after today, status in requested/approved/booked
        if (startIso && startIso > today && (row.status === 'requested' || row.status === 'approved' || row.status === 'booked')) {
          future_leave.push(row);
        }
      }

      // Match legacy ordering expectations (consumers rely on these).
      annual_leave.sort((a, b) => String(a.person || '').localeCompare(String(b.person || '')));
      future_leave.sort((a, b) => {
        const d = toIso(a.start_date).localeCompare(toIso(b.start_date));
        return d !== 0 ? d : String(a.person || '').localeCompare(String(b.person || ''));
      });
      // all_data already sorted by start_date DESC from SQL.

      return {
        annual_leave,
        future_leave,
        all_data,
        team: teamResult.recordset
      };
    },
    1800
  ).finally(() => {
    inFlightGeneralAnnualLeave.delete(cacheKey);
  });

  inFlightGeneralAnnualLeave.set(cacheKey, promise);
  return promise;
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
async function checkAnnualLeave({ forceRefresh = false } = {}) {
  try {
    const today = getTodayIso();
    const generalLeaveData = await getGeneralAnnualLeaveData(today, { forceRefresh });
    const activeLeave = Array.isArray(generalLeaveData?.annual_leave) ? generalLeaveData.annual_leave : [];

    return activeLeave
      .map((row) => String(row?.person || row?.fe || '').trim().toUpperCase())
      .filter(Boolean);
  } catch (error) {
    console.error('Error checking annual leave:', error);
    return [];
  }
}

// Get attendance data for team with annual leave integration
// Support both GET and POST for flexibility
const getAttendanceHandler = async (req, res) => {
  try {
    // Generate cache key based on current date (attendance changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('attendance', 'team-data', today);
    const forceRefresh = String(req.query?.forceRefresh || '').toLowerCase() === 'true';

    if (forceRefresh) {
      clearAttendanceMemCached(cacheKey);
      try {
        await deleteCache(cacheKey);
      } catch {
        // Non-blocking
      }
    }

    // Fast path: in-memory cache (avoids Redis round-trip on critical path)
    const memCached = getAttendanceMemCached(cacheKey);
    if (memCached) {
      return res.json(memCached);
    }
    
    // Try to get cached data first
    const cachedData = await cacheWrapper(
      cacheKey,
      async () => {
        const password = await getSqlPassword();
        if (!password) {
          throw new Error('Could not retrieve database credentials');
        }
        
        const { coreDataConnStr } = getAttendanceConnectionStrings(password);
        
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
            FROM [dbo].[Attendance]
            WHERE [Week_Start] <= CAST(GETDATE() AS DATE) 
              AND [Week_End] >= CAST(GETDATE() AS DATE)
              AND [Initials] IS NOT NULL
          )
          SELECT First, Initials, Level, Week_Start, Week_End, iso, Status, Confirmed_At
          FROM LatestAttendance
          WHERE rn = 1
          ORDER BY Initials
        `));

        // Get team roster data + annual leave in parallel (saves 1-2s)
        const [teamResult, peopleOnLeaveList] = await Promise.all([
          attendanceQuery(coreDataConnStr, (req) => req.query(`
            SELECT 
              [First],
              [Initials],
              [Entra ID],
              [Nickname]
            FROM [dbo].[team]
            WHERE [status] <> 'inactive'
            ORDER BY [First]
          `)),
          checkAnnualLeave({ forceRefresh }),
        ]);
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

    const responsePayload = {
      success: true,
      ...cachedData
    };

    // Store in memory cache for fast subsequent requests
    setAttendanceMemCached(cacheKey, responsePayload);

    res.json(responsePayload);

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
    
    const { coreDataConnStr } = getAttendanceConnectionStrings(password);
    
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

    // Realtime notify (payload-light: clients refetch)
    try {
      broadcastAttendanceChanged({
        changeType: 'updated',
        initials: String(initials || '').toUpperCase(),
        weekStart: String(weekStart || ''),
      });
    } catch {
      // Non-blocking
    }

    // Clear attendance cache after successful update
    clearAttendanceMemCached(); // Clear all in-memory attendance cache
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

// POST /api/attendance/unconfirmAttendance — clear Confirmed_At so user appears unconfirmed
router.post('/unconfirmAttendance', async (req, res) => {
  try {
    const { initials, weekStart } = req.body;
    if (!initials || !weekStart) {
      return res.status(400).json({ success: false, error: 'Missing required fields: initials, weekStart' });
    }

    const password = await getSqlPassword();
    if (!password) throw new Error('Could not retrieve database credentials');

    const { coreDataConnStr } = getAttendanceConnectionStrings(password);

    // Set Confirmed_At to NULL and clear Attendance_Days
    await attendanceQuery(coreDataConnStr, (req, sql) =>
      req.input('initials', sql.VarChar(10), initials)
        .input('weekStart', sql.Date, weekStart)
        .query(`
          UPDATE Attendance
          SET Confirmed_At = NULL,
              Attendance_Days = NULL
          WHERE Initials = @initials AND Week_Start = @weekStart
        `)
    );

    res.json({ success: true, message: 'Attendance unconfirmed', initials, weekStart });

    // Realtime notify
    try {
      broadcastAttendanceChanged({
        changeType: 'unconfirmed',
        initials: String(initials || '').toUpperCase(),
        weekStart: String(weekStart || ''),
      });
    } catch { /* non-blocking */ }

    // Clear cache
    try { await deleteCachePattern('attendance:*'); } catch { /* non-critical */ }
  } catch (error) {
    console.error('Error unconfirming attendance:', error.message || error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE: attendance realtime change notifications
attachAttendanceStream(router);

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
      const secretClient = getClient();
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
    const secretClient = getClient();
    
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

// ===== Outlook (Graph) helpers =====
const GRAPH_TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';
const GRAPH_TIMEZONE = 'Europe/London';
let graphSecretsCache = { clientId: null, clientSecret: null, expiresAt: 0 };
let graphTokenCache = { token: null, exp: 0 };

async function getGraphSecrets() {
  const now = Date.now();
  if (graphSecretsCache.clientId && graphSecretsCache.clientSecret && now < graphSecretsCache.expiresAt) {
    return { clientId: graphSecretsCache.clientId, clientSecret: graphSecretsCache.clientSecret };
  }

  try {
    const secretClient = getClient();

    const [clientIdSecret, clientSecretSecret] = await Promise.all([
      secretClient.getSecret('graph-aidenteams-clientid'),
      secretClient.getSecret('aiden-email-secret-value')
    ]);

    graphSecretsCache = {
      clientId: clientIdSecret.value || null,
      clientSecret: clientSecretSecret.value || null,
      expiresAt: Date.now() + 60 * 60 * 1000
    };

    return { clientId: graphSecretsCache.clientId, clientSecret: graphSecretsCache.clientSecret };
  } catch (error) {
    console.error('Error getting Graph secrets from Key Vault:', error);
    return { clientId: null, clientSecret: null };
  }
}

async function getGraphAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (graphTokenCache.token && graphTokenCache.exp - 300 > now) {
    return graphTokenCache.token;
  }

  const { clientId, clientSecret } = await getGraphSecrets();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  try {
    const res = await axios.post(
      `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const token = res.data?.access_token;
    if (!token) return null;
    graphTokenCache = { token, exp: now + (res.data?.expires_in || 3600) };
    return token;
  } catch (error) {
    console.error('Error obtaining Graph access token:', error?.response?.data || error.message);
    return null;
  }
}

function formatGraphDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function buildOutlookEventPayload({ initials, startDate, endDate, halfDayStart, halfDayEnd, requestId }) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const isSingleDay = start.toDateString() === end.toDateString();
  const isHalfDay = halfDayStart || halfDayEnd;

  if (isSingleDay && isHalfDay) {
    const startHour = halfDayStart ? 13 : 9;
    const endHour = halfDayEnd ? 13 : 17;
    start.setHours(startHour, 0, 0, 0);
    end.setHours(endHour, 0, 0, 0);
  } else if (isHalfDay) {
    if (halfDayStart) {
      start.setHours(13, 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }

    if (halfDayEnd) {
      end.setHours(13, 0, 0, 0);
    } else {
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
    }
  } else {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
  }

  const suffix = [];
  if (halfDayStart) suffix.push('starts PM');
  if (halfDayEnd) suffix.push('ends AM');

  return {
    subject: `${initials} Annual Leave`,
    body: {
      contentType: 'HTML',
      content: `Annual leave for ${initials}${suffix.length ? ` (${suffix.join(', ')})` : ''}.`
    },
    isAllDay: !halfDayStart && !halfDayEnd,
    showAs: 'oof',
    transactionId: `annual-leave-${requestId}`,
    start: {
      dateTime: formatGraphDateTime(start),
      timeZone: GRAPH_TIMEZONE
    },
    end: {
      dateTime: formatGraphDateTime(end),
      timeZone: GRAPH_TIMEZONE
    }
  };
}

async function createOutlookCalendarEntry(accessToken, userId, payload) {
  try {
    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return response.data?.id || null;
  } catch (error) {
    console.error('Error creating Outlook calendar entry:', error?.response?.data || error.message);
    return null;
  }
}

async function deleteOutlookCalendarEntry(accessToken, userId, eventId) {
  try {
    const response = await axios.delete(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return response.status === 204;
  } catch (error) {
    console.error('Error deleting Outlook calendar entry:', error?.response?.data || error.message);
    return false;
  }
}

async function findOutlookEventIdForLeave(accessToken, userId, { startDate, endDate, transactionId, subject }) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    start.setHours(0, 0, 0, 0);
    const searchEnd = new Date(end);
    searchEnd.setDate(searchEnd.getDate() + 1);
    searchEnd.setHours(0, 0, 0, 0);

    const searchUrl = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/calendarView`);
    searchUrl.searchParams.set('startDateTime', formatGraphDateTime(start));
    searchUrl.searchParams.set('endDateTime', formatGraphDateTime(searchEnd));
    searchUrl.searchParams.set('$top', '50');

    let nextUrl = searchUrl.toString();
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `outlook.timezone="${GRAPH_TIMEZONE}"`
        }
      });

      const events = response.data?.value || [];
      for (const event of events) {
        if (transactionId && event.transactionId === transactionId) {
          return event.id || null;
        }

        if (subject && event.subject === subject) {
          const eventStart = String(event.start?.dateTime || '').slice(0, 10);
          const eventEnd = String(event.end?.dateTime || '').slice(0, 10);
          const expectedStart = format(new Date(startDate), 'yyyy-MM-dd');
          const expectedEnd = format(searchEnd, 'yyyy-MM-dd');
          if (eventStart === expectedStart && eventEnd === expectedEnd) {
            return event.id || null;
          }
        }
      }

      nextUrl = response.data?.['@odata.nextLink'] || null;
    }

    return null;
  } catch (error) {
    console.error('Error searching Outlook calendar entry:', error?.response?.data || error.message);
    return null;
  }
}

async function getTeamMemberByInitials(initials, password) {
  if (!initials) return null;
  const { coreDataConnStr } = getAttendanceConnectionStrings(password);

  try {
    const result = await attendanceQuery(coreDataConnStr, (req, sqlTypes) =>
      req.input('initials', sqlTypes.VarChar(10), String(initials).trim().toUpperCase())
        .query(`
          SELECT Email, [Entra ID], First, Last
          FROM [dbo].[team]
          WHERE Initials = @initials
        `)
    );

    const row = result.recordset?.[0];
    if (!row) return null;
    return {
      email: row.Email || null,
      entraId: row['Entra ID'] || null,
      firstName: row.First || null,
      lastName: row.Last || null
    };
  } catch (error) {
    console.error('Error fetching team member for Outlook calendar:', error);
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
    let userDetails = { leaveEntries: [], totals: { standard: 0, purchase: 0, unpaid: 0, sale: 0, rejected: 0 } };

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
              } else if (leaveType === 'purchase' || leaveType === 'unpaid') {
                acc.purchase += days;
                acc.unpaid += days;
              } else if (leaveType === 'sale') {
                acc.sale += days;
              }
            }

            return acc;
          },
          { standard: 0, purchase: 0, unpaid: 0, sale: 0, rejected: 0 }
        );

        userDetails = { leaveEntries: filteredEntries, totals };
      } else {
        // Fallback to direct query if cached general data couldn't be retrieved
        const password = await getSqlPassword();
        if (!password) {
          throw new Error('Could not retrieve database credentials');
        }

        const { projectDataConnStr } = getAttendanceConnectionStrings(password);
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
                hearing_details,
                requested_at,
                approved_at,
                booked_at,
                updated_at
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
              } else if (leaveType === 'purchase' || leaveType === 'unpaid') {
                acc.purchase += days;
                acc.unpaid += days;
              } else if (leaveType === 'sale') {
                acc.sale += days;
              }
            }
            return acc;
          },
          { standard: 0, purchase: 0, unpaid: 0, sale: 0, rejected: 0 }
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
    const emptyUserDetails = { leaveEntries: [], totals: { standard: 0, purchase: 0, unpaid: 0, sale: 0, rejected: 0 } };
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
  let submissionId = null;
  try {
    const { fe, dateRanges, reason, days_taken, leave_type, hearing_confirmation, hearing_details, admin_status } = req.body;

    // Validate required fields
    if (!fe || !Array.isArray(dateRanges) || dateRanges.length === 0 || !leave_type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fe, dateRanges, or leave_type"
      });
    }

    // form_submissions audit log. Different form_keys distinguish the three
    // annual-leave intake UIs (request / booking / admin-booking) so the rail
    // groups them correctly. `admin_status` is the proxy: explicit 'booked' =
    // admin booking, otherwise it's a staff request. The auto-book allowlist
    // (AC, JW) lands as 'annual-leave-booking' too because their requests
    // skip the approval workflow.
    const validAdminStatusesForKey = new Set(['booked', 'requested', 'approved']);
    const isAdminBooking = typeof admin_status === 'string'
      && validAdminStatusesForKey.has(String(admin_status).toLowerCase())
      && String(admin_status).toLowerCase() === 'booked';
    const formKeyForSubmission = isAdminBooking
      ? 'annual-leave-admin'
      : (shouldAutoBookAnnualLeave(fe) ? 'annual-leave-booking' : 'annual-leave-request');
    try {
      submissionId = await recordSubmission({
        formKey: formKeyForSubmission,
        submittedBy: String(fe || 'UNK').slice(0, 10),
        lane: 'Request',
        payload: req.body,
        summary: `Annual leave (${leave_type}) \u2014 ${dateRanges.length} range${dateRanges.length === 1 ? '' : 's'}`.slice(0, 400),
      });
    } catch (logErr) {
      trackException(logErr, { phase: 'annualLeave.recordSubmission' });
    }

    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve database credentials'
      });
    }

    const { projectDataConnStr } = getAttendanceConnectionStrings(password);

    const insertedIds = [];
    const shouldAutoBook = shouldAutoBookAnnualLeave(fe);
    // admin_status allows admins to directly book leave (bypassing approval workflow)
    const validAdminStatuses = new Set(['booked', 'requested', 'approved']);
    const effectiveAdminStatus = admin_status && validAdminStatuses.has(String(admin_status).toLowerCase())
      ? String(admin_status).toLowerCase()
      : null;
    const initialStatus = effectiveAdminStatus || (shouldAutoBook ? 'booked' : 'requested');
    const needsCalendarSync = initialStatus === 'booked';
    
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
          .input('status', sql.VarChar(50), initialStatus)
          .input('days_taken', sql.Float, computedDays)
          .input('leave_type', sql.VarChar(50), leave_type)
          .input('hearing_confirmation', sql.Bit, hearing_confirmation?.toLowerCase() === "yes" ? 1 : 0)
          .input('hearing_details', sql.NVarChar(sql.MAX), hearing_details || "")
          .input('half_day_start', sql.Bit, range.half_day_start ? 1 : 0)
          .input('half_day_end', sql.Bit, range.half_day_end ? 1 : 0)
          .query(`
            INSERT INTO [dbo].[annualLeave] 
              ([fe], [start_date], [end_date], [reason], [status], [days_taken], [leave_type], [hearing_confirmation], [hearing_details], [half_day_start], [half_day_end], [requested_at], [approved_at], [booked_at], [updated_at])
            VALUES 
              (@fe, @start_date, @end_date, @reason, @status, @days_taken, @leave_type, @hearing_confirmation, @hearing_details, @half_day_start, @half_day_end, SYSUTCDATETIME(), CASE WHEN @status = 'booked' THEN SYSUTCDATETIME() ELSE NULL END, CASE WHEN @status = 'booked' THEN SYSUTCDATETIME() ELSE NULL END, SYSUTCDATETIME());
            SELECT SCOPE_IDENTITY() AS InsertedId;
          `)
      );
      
      insertedIds.push(result.recordset[0].InsertedId);
    }

    if (needsCalendarSync) {
      try {
        const settled = await Promise.allSettled(
          insertedIds.map((requestId) => ensureAnnualLeaveCalendarEntries({
            projectDataConnStr,
            password,
            requestId
          }))
        );

        const failed = settled.filter((result) => result.status === 'rejected');
        if (failed.length > 0) {
          console.error('Auto-book annual leave: calendar side-effects failed for some entries', {
            fe,
            failures: failed.map((result) => String(result.reason?.message || result.reason || 'unknown'))
          });
        }
      } catch (calendarError) {
        console.error('Auto-book annual leave: calendar side-effects failed', calendarError);
      }
    }

    res.status(201).json({
      success: true,
      message: needsCalendarSync
        ? 'Annual leave entries created and automatically booked.'
        : 'Annual leave entries created successfully.',
      insertedIds
    });

    await recordStep(submissionId, {
      name: 'annual_leave.insert',
      status: 'success',
      output: { ids: insertedIds, status: initialStatus },
    });
    await markComplete(submissionId, {
      lastEvent: needsCalendarSync ? 'annual leave booked + calendar synced' : 'annual leave recorded',
    });

    // Realtime notify (payload-light: clients refetch)
    try {
      broadcastAnnualLeaveChanged({ changeType: 'created', ids: insertedIds });
    } catch {
      // Non-blocking
    }

    // HOME_TODO_SINGLE_PICKUP_SURFACE — B2 wiring for annual-leave.
    // For requested (non-auto-booked) leaves, land one card per approver on
    // dbo.hub_todo. Each card gets matter_ref = 'leave:<id>' so
    // reconcileAllByRef can close every approver's card when the status flips
    // to approved/rejected/booked. Best-effort; never blocks the response.
    if (!needsCalendarSync) {
      try {
        let requesterAow = '';
        try {
          const aowRow = await attendanceQuery(projectDataConnStr, (reqSql, s) =>
            reqSql.input('fe', s.VarChar(50), fe).query(
              `SELECT TOP 1 [AOW] FROM dbo.team WHERE UPPER(Initials) = UPPER(@fe)`
            )
          );
          requesterAow = aowRow.recordset?.[0]?.AOW || '';
        } catch { /* best-effort; default to AC path */ }
        const approvers = determineLeaveApprovers(requesterAow);
        const dateRangeSummary = dateRanges.length === 1
          ? `${dateRanges[0].start_date} → ${dateRanges[0].end_date}`
          : `${dateRanges.length} ranges`;
        await Promise.all(insertedIds.map(async (leaveId) => {
          await Promise.all(approvers.map((ownerInitials) => createHubTodoCard({
            kind: 'annual-leave',
            ownerInitials,
            matterRef: `leave:${leaveId}`,
            docType: leave_type || 'Annual leave',
            stage: 'pending',
            summary: `Leave · ${fe} · ${dateRangeSummary}`,
            lastEvent: `Requested by ${fe}`,
            payload: {
              leaveId: String(leaveId),
              requester: String(fe || ''),
              leaveType: leave_type || null,
              dateRanges,
              reason: reason || null,
            },
          })));
        }));
      } catch (todoErr) {
        trackEvent('Todo.Card.Created.Failed', {
          kind: 'annual-leave',
          error: todoErr?.message || String(todoErr),
        });
      }
    }

    // Clear annual leave cache after successful creation
    try {
      const today = getTodayIso();
      const cacheKey = generateCacheKey('attendance', 'annual-leave-general', today);
      try {
        await deleteCache(cacheKey);
      } catch (cacheError) {
        // Single-key cache clear failed, continue
      }
      await deleteCachePattern('attendance:annual-leave*');
      // Attendance mem cache embeds the on-leave flag — bust so the longer
      // 120s TTL cannot serve a stale "available" status for the requester.
      clearAttendanceMemCached();
    } catch (cacheError) {
      // Cache clear failed, not critical
    }

  } catch (error) {
    console.error('Error inserting annual leave:', error.message || error);
    if (submissionId) {
      await markFailed(submissionId, { lastEvent: 'annual-leave:insert:failed', error });
    }
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

    const { projectDataConnStr } = getAttendanceConnectionStrings(password);

    let effectiveStatus = String(newStatus).toLowerCase();

    // For specific users, bypass the approval/booking workflow: approval -> booked.
    try {
      const existing = await attendanceQuery(projectDataConnStr, (req, sql) =>
        req.input('id', sql.Int, parsedId).query(`
          SELECT fe
          FROM [dbo].[annualLeave]
          WHERE request_id = @id
        `)
      );
      const existingInitials = existing.recordset?.[0]?.fe;
      if (shouldAutoBookAnnualLeave(existingInitials) && effectiveStatus === 'approved') {
        effectiveStatus = 'booked';
      }
    } catch (lookupError) {
      // If we can't resolve FE, fall back to requested status change.
    }

    // Update the record
    const updateResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('id', sql.Int, parsedId)
        .input('newStatus', sql.VarChar(50), effectiveStatus)
        .input('rejectionNotes', sql.NVarChar(sql.MAX), rejection_notes || "")
        .query(`
          UPDATE [dbo].[annualLeave]
             SET [status] = @newStatus,
                 [rejection_notes] = CASE 
                                       WHEN @newStatus = 'rejected' AND (@rejectionNotes IS NOT NULL AND @rejectionNotes <> '')
                                       THEN @rejectionNotes 
                                       ELSE [rejection_notes] 
                                     END,
                 [requested_at] = CASE 
                                   WHEN @newStatus = 'requested' AND [requested_at] IS NULL THEN SYSUTCDATETIME()
                                   ELSE [requested_at]
                                 END,
                 [approved_at] = CASE 
                                  WHEN @newStatus = 'approved' AND [approved_at] IS NULL THEN SYSUTCDATETIME()
                                  ELSE [approved_at]
                                END,
                 [booked_at] = CASE 
                                 WHEN @newStatus = 'booked' AND [booked_at] IS NULL THEN SYSUTCDATETIME()
                                 ELSE [booked_at]
                               END,
                 [updated_at] = SYSUTCDATETIME()
           WHERE [request_id] = @id;
        `)
    );

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: `No record found with ID ${id}, or the status transition is invalid.`
      });
    }

    try {
      await ensureAnnualLeaveCalendarEntries({ projectDataConnStr, password, requestId: parsedId });
    } catch (calendarError) {
      console.error('Error syncing annual leave calendar entries:', calendarError);
      // Continue with the response even if calendar sync fails
    }

    try {
      const leaveRecordResult = await attendanceQuery(projectDataConnStr, (reqSql, s) =>
        reqSql
          .input('id', s.Int, parsedId)
          .query(`
            SELECT request_id, fe, start_date, end_date, days_taken, leave_type, reason, status
            FROM [dbo].[annualLeave]
            WHERE request_id = @id
          `)
      );

      const leaveRecord = leaveRecordResult.recordset?.[0] || null;
      if (leaveRecord) {
        const notified = await sendPayrollAnnualLeaveNotification({ req, leaveRecord, effectiveStatus });
        if (!notified && PAYROLL_NOTIFICATION_LEAVE_TYPES.has(String(leaveRecord.leave_type || '').toLowerCase()) && ['approved', 'booked'].includes(String(effectiveStatus).toLowerCase())) {
          console.warn(`Payroll annual leave notification was not sent for request ${parsedId}.`);
        }
      }
    } catch (notificationError) {
      console.warn('Payroll annual leave notification error (non-blocking):', notificationError?.message || notificationError);
    }

    res.json({
      success: true,
      message: `Annual leave ID ${id} updated to status '${effectiveStatus}'.`
    });

    // Realtime notify (payload-light: clients refetch)
    try {
      broadcastAnnualLeaveChanged({ changeType: 'status-updated', id: String(id), newStatus: String(effectiveStatus) });
    } catch {
      // Non-blocking
    }

    // HOME_TODO_SINGLE_PICKUP_SURFACE — B2 reconcile. Status transitions out
    // of 'requested' mean the approval decision has been made; close every
    // open card for this leave id across all approvers.
    try {
      const terminalStatuses = new Set(['approved', 'booked', 'rejected', 'discarded']);
      if (terminalStatuses.has(String(effectiveStatus).toLowerCase())) {
        const via = String(effectiveStatus).toLowerCase() === 'rejected'
          ? 'reject'
          : (String(effectiveStatus).toLowerCase() === 'discarded' ? 'manual-dismiss' : 'approve');
        await reconcileHubTodoByRef({
          kind: 'annual-leave',
          matterRef: `leave:${parsedId}`,
          completedVia: via,
          lastEvent: `Status → ${effectiveStatus}`,
        });
      }
    } catch (todoErr) {
      trackEvent('Todo.Reconcile.Failed', {
        kind: 'annual-leave',
        id: String(parsedId),
        error: todoErr?.message || String(todoErr),
      });
    }

    // Clear annual leave cache after successful update
    try {
      const today = getTodayIso();
      const cacheKey = generateCacheKey('attendance', 'annual-leave-general', today);
      try {
        await deleteCache(cacheKey);
      } catch (cacheError) {
        // Single-key cache clear failed, continue
      }
      await deleteCachePattern('attendance:annual-leave*');
      // Attendance mem cache embeds the on-leave flag (120s TTL).
      clearAttendanceMemCached();
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

async function ensureAnnualLeaveCalendarEntries({ projectDataConnStr, password, requestId }) {
  const parsedId = Number(requestId);
  if (!Number.isFinite(parsedId)) {
    throw new Error(`ensureAnnualLeaveCalendarEntries: invalid requestId '${requestId}'`);
  }

  // Fetch the leave record details including half-day flags and leave type/status.
  const leaveResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
    req.input('id', sql.Int, parsedId)
      .query(`
        SELECT fe, start_date, end_date, status, leave_type, ClioEntryId, OutlookEntryId, half_day_start, half_day_end
        FROM [dbo].[annualLeave]
        WHERE request_id = @id
      `)
  );

  const leaveRecord = leaveResult.recordset?.[0];
  if (!leaveRecord) {
    return;
  }

  if (!shouldSyncAnnualLeaveCalendars(leaveRecord)) {
    if (leaveRecord.ClioEntryId) {
      const clioSecrets = await getClioSecrets();
      if (clioSecrets) {
        const accessToken = await getClioAccessToken(clioSecrets);
        if (accessToken) {
          const clioDeleted = await deleteClioCalendarEntry(accessToken, leaveRecord.ClioEntryId);
          if (clioDeleted) {
            await attendanceQuery(projectDataConnStr, (req, sql) =>
              req.input('id', sql.Int, parsedId)
                .query(`
                  UPDATE [dbo].[annualLeave]
                     SET [ClioEntryId] = NULL
                   WHERE [request_id] = @id;
                `)
            );
          }
        }
      }
    }

    const teamMember = await getTeamMemberByInitials(leaveRecord.fe, password);
    const outlookUserId = teamMember?.entraId || teamMember?.email;
    if (outlookUserId) {
      const graphToken = await getGraphAccessToken();
      if (graphToken) {
        let outlookDeleted = false;
        if (leaveRecord.OutlookEntryId) {
          outlookDeleted = await deleteOutlookCalendarEntry(graphToken, outlookUserId, leaveRecord.OutlookEntryId);
        }

        if (!outlookDeleted) {
          const fallbackEventId = await findOutlookEventIdForLeave(graphToken, outlookUserId, {
            startDate: leaveRecord.start_date,
            endDate: leaveRecord.end_date,
            transactionId: `annual-leave-${parsedId}`,
            subject: `${leaveRecord.fe} Annual Leave`
          });
          if (fallbackEventId) {
            outlookDeleted = await deleteOutlookCalendarEntry(graphToken, outlookUserId, fallbackEventId);
          }
        }

        if (leaveRecord.OutlookEntryId && outlookDeleted) {
          await attendanceQuery(projectDataConnStr, (req, sql) =>
            req.input('id', sql.Int, parsedId)
              .query(`
                UPDATE [dbo].[annualLeave]
                   SET [OutlookEntryId] = NULL
                 WHERE [request_id] = @id;
              `)
          );
        }
      }
    }

    return;
  }

  if (!leaveRecord.ClioEntryId) {
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

        if (clioEntryId) {
          await attendanceQuery(projectDataConnStr, (req, sql) =>
            req.input('id', sql.Int, parsedId)
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

  if (!leaveRecord.OutlookEntryId) {
    const teamMember = await getTeamMemberByInitials(leaveRecord.fe, password);
    const outlookUserId = teamMember?.entraId || teamMember?.email;
    if (outlookUserId) {
      const graphToken = await getGraphAccessToken();
      if (graphToken) {
        const payload = buildOutlookEventPayload({
          initials: leaveRecord.fe,
          startDate: leaveRecord.start_date,
          endDate: leaveRecord.end_date,
          halfDayStart: leaveRecord.half_day_start,
          halfDayEnd: leaveRecord.half_day_end,
          requestId: parsedId
        });

        const outlookEntryId = await createOutlookCalendarEntry(graphToken, outlookUserId, payload);
        if (outlookEntryId) {
          await attendanceQuery(projectDataConnStr, (req, sql) =>
            req.input('id', sql.Int, parsedId)
              .input('outlookEntryId', sql.NVarChar(100), outlookEntryId)
              .query(`
                UPDATE [dbo].[annualLeave]
                   SET [OutlookEntryId] = @outlookEntryId
                 WHERE [request_id] = @id;
              `)
          );
        }
      }
    }
  }
}

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

// PUT /api/attendance/admin/annual-leave - Admin endpoint to modify leave records (status, days_taken, leave_type, reason)
router.put('/admin/annual-leave', async (req, res) => {
  try {
    const { id, newStatus, days_taken, leave_type, reason } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing 'id' in request body."
      });
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ID format: '${id}'. Expected a numeric value.`
      });
    }

    // Validate status if provided
    const allowedStatuses = ['requested', 'approved', 'booked', 'rejected', 'acknowledged', 'discarded'];
    if (newStatus && !allowedStatuses.includes(newStatus.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'newStatus'. Allowed statuses are: ${allowedStatuses.join(', ')}.`
      });
    }

    const allowedLeaveTypes = ['standard', 'purchase', 'sale', 'unpaid'];
    if (leave_type && !allowedLeaveTypes.includes(String(leave_type).toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'leave_type'. Allowed leave types are: ${allowedLeaveTypes.join(', ')}.`
      });
    }

    const password = await getSqlPassword();
    if (!password) {
      return res.status(500).json({
        success: false,
        error: 'Could not retrieve database credentials'
      });
    }

    const { projectDataConnStr } = getAttendanceConnectionStrings(password);

    // Build dynamic update query based on provided fields
    const updates = [];
    const inputs = [];

    if (newStatus) {
      updates.push('[status] = @newStatus');
      inputs.push({ name: 'newStatus', type: sql.VarChar(50), value: newStatus });
      updates.push(`[requested_at] = CASE WHEN @newStatus = 'requested' AND [requested_at] IS NULL THEN SYSUTCDATETIME() ELSE [requested_at] END`);
      updates.push(`[approved_at] = CASE WHEN @newStatus = 'approved' AND [approved_at] IS NULL THEN SYSUTCDATETIME() ELSE [approved_at] END`);
      updates.push(`[booked_at] = CASE WHEN @newStatus = 'booked' AND [booked_at] IS NULL THEN SYSUTCDATETIME() ELSE [booked_at] END`);
    }

    if (days_taken !== undefined && days_taken !== null) {
      updates.push('[days_taken] = @daysTaken');
      inputs.push({ name: 'daysTaken', type: sql.Decimal(5, 1), value: parseFloat(days_taken) });
    }

    if (leave_type) {
      updates.push('[leave_type] = @leaveType');
      inputs.push({ name: 'leaveType', type: sql.VarChar(50), value: String(leave_type).toLowerCase() });
    }

    if (reason !== undefined) {
      updates.push('[reason] = @reason');
      inputs.push({ name: 'reason', type: sql.NVarChar(sql.MAX), value: String(reason) });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update. Provide newStatus, days_taken, leave_type, and/or reason.'
      });
    }

    updates.push('[updated_at] = SYSUTCDATETIME()');

    const updateResult = await attendanceQuery(projectDataConnStr, (reqSql, sqlTypes) => {
      let request = reqSql.input('id', sqlTypes.Int, parsedId);
      inputs.forEach(inp => {
        request = request.input(inp.name, inp.type, inp.value);
      });
      return request.query(`
        UPDATE [dbo].[annualLeave]
           SET ${updates.join(', ')}
         WHERE [request_id] = @id;
      `);
    });

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: `No record found with ID ${id}.`
      });
    }

    if (newStatus || leave_type) {
      try {
        await ensureAnnualLeaveCalendarEntries({ projectDataConnStr, password, requestId: parsedId });
      } catch (calendarError) {
        console.error('Error syncing annual leave calendars (admin):', calendarError);
      }
    }

    // Clear cache
    const today = getTodayIso();
    const cacheKey = generateCacheKey('attendance', 'annual-leave-general', today);
    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.warn('Failed to clear annual leave cache:', cacheError);
    }

    // Also clear the broader annual-leave cache namespace as a backstop
    try {
      await deleteCachePattern('attendance:annual-leave*');
    } catch (cacheError) {
      // Cache clear failed, not critical
    }
    // Attendance mem cache embeds the on-leave flag (120s TTL).
    clearAttendanceMemCached();

    console.log(`[Admin] Updated annual leave record ${id}: status=${newStatus || 'unchanged'}, leave_type=${leave_type || 'unchanged'}, days_taken=${days_taken ?? 'unchanged'}, reason=${reason !== undefined ? 'updated' : 'unchanged'}`);

    res.json({
      success: true,
      message: `Successfully updated annual leave record ${id}.`
    });

    // Realtime notify (payload-light: clients refetch)
    try {
      broadcastAnnualLeaveChanged({ changeType: 'admin-updated', id: String(id), newStatus: newStatus ? String(newStatus) : undefined });
    } catch {
      // Non-blocking
    }

    // HOME_TODO_SINGLE_PICKUP_SURFACE — B2 reconcile on admin edits.
    try {
      const terminalStatuses = new Set(['approved', 'booked', 'rejected', 'discarded']);
      if (newStatus && terminalStatuses.has(String(newStatus).toLowerCase())) {
        const via = String(newStatus).toLowerCase() === 'rejected'
          ? 'reject'
          : (String(newStatus).toLowerCase() === 'discarded' ? 'manual-dismiss' : 'approve');
        await reconcileHubTodoByRef({
          kind: 'annual-leave',
          matterRef: `leave:${id}`,
          completedVia: via,
          lastEvent: `Admin set status → ${newStatus}`,
        });
      }
    } catch (todoErr) {
      trackEvent('Todo.Reconcile.Failed', {
        kind: 'annual-leave',
        id: String(id),
        error: todoErr?.message || String(todoErr),
      });
    }

  } catch (error) {
    console.error('Error updating annual leave (admin):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update annual leave record'
    });
  }
});

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

    const { projectDataConnStr } = getAttendanceConnectionStrings(password);

    // First, fetch the record to get Clio entry ID if it exists
    const fetchResult = await attendanceQuery(projectDataConnStr, (req, sql) =>
      req.input('id', sql.Int, parsedId)
        .query(`
          SELECT request_id, fe, start_date, end_date, ClioEntryId, OutlookEntryId, status
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
    let outlookDeleted = null;
    let outlookMatched = null;

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

    // Delete from Outlook if an event exists
    if (record.OutlookEntryId) {
      try {
        const teamMember = await getTeamMemberByInitials(record.fe, password);
        const outlookUserId = teamMember?.entraId || teamMember?.email;
        if (outlookUserId) {
          const graphToken = await getGraphAccessToken();
          if (graphToken) {
            outlookDeleted = await deleteOutlookCalendarEntry(graphToken, outlookUserId, record.OutlookEntryId);
            outlookMatched = true;
            if (!outlookDeleted) {
              const fallbackEventId = await findOutlookEventIdForLeave(graphToken, outlookUserId, {
                startDate: record.start_date,
                endDate: record.end_date,
                transactionId: `annual-leave-${record.request_id}`,
                subject: `${record.fe} Annual Leave`
              });
              if (fallbackEventId) {
                outlookMatched = true;
                outlookDeleted = await deleteOutlookCalendarEntry(graphToken, outlookUserId, fallbackEventId);
              }
            }
          }
        }
      } catch (outlookError) {
        console.error('Error deleting Outlook calendar entry:', outlookError);
        // Continue with SQL deletion even if Outlook fails
      }
    } else {
      try {
        const teamMember = await getTeamMemberByInitials(record.fe, password);
        const outlookUserId = teamMember?.entraId || teamMember?.email;
        if (outlookUserId) {
          const graphToken = await getGraphAccessToken();
          if (graphToken) {
            const fallbackEventId = await findOutlookEventIdForLeave(graphToken, outlookUserId, {
              startDate: record.start_date,
              endDate: record.end_date,
              transactionId: `annual-leave-${record.request_id}`,
              subject: `${record.fe} Annual Leave`
            });
            if (fallbackEventId) {
              outlookMatched = true;
              outlookDeleted = await deleteOutlookCalendarEntry(graphToken, outlookUserId, fallbackEventId);
            } else {
              outlookMatched = false;
            }
          }
        }
      } catch (outlookError) {
        console.error('Error searching Outlook calendar entry:', outlookError);
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
      clioDeleted: record.ClioEntryId ? clioDeleted : null,
      outlookDeleted: typeof outlookDeleted === 'boolean' ? outlookDeleted : null,
      outlookMatched: typeof outlookMatched === 'boolean' ? outlookMatched : null,
      sqlDeleted: true
    });

    // Realtime notify (payload-light: clients refetch)
    try {
      broadcastAnnualLeaveChanged({ changeType: 'deleted', id: String(id) });
    } catch {
      // Non-blocking
    }

    // HOME_TODO_SINGLE_PICKUP_SURFACE — B2 reconcile on delete.
    try {
      await reconcileHubTodoByRef({
        kind: 'annual-leave',
        matterRef: `leave:${parsedId}`,
        completedVia: 'auto',
        lastEvent: 'Leave record deleted',
      });
    } catch (todoErr) {
      trackEvent('Todo.Reconcile.Failed', {
        kind: 'annual-leave',
        id: String(parsedId),
        error: todoErr?.message || String(todoErr),
      });
    }

    // Clear annual leave cache after successful deletion
    try {
      await deleteCachePattern('attendance:annual-leave*');
      // Attendance mem cache embeds the on-leave flag (120s TTL).
      clearAttendanceMemCached();
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

// SSE: annual leave realtime change notifications
attachAnnualLeaveStream(router);

module.exports = router;