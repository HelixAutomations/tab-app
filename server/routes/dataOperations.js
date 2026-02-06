/**
 * Data Operations API
 *
 * Server routes for manual invocation of data sync operations:
 * - Collected Time (invoice payments from Clio → collectedTime table)
 * - Recorded Time / WIP (activities from Clio → wip table)
 *
 * These mirror the Azure Functions timer triggers but allow on-demand execution
 * from the Data Centre UI.
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { createLogger } = require('../utils/logger');

const opsLogger = createLogger('DataOps');

// ─────────────────────────────────────────────────────────────
// In-memory operation log (persists for server lifetime)
// ─────────────────────────────────────────────────────────────
const operationLog = [];
const MAX_LOG_ENTRIES = 100;

// Job Cancellation Map
const activeJobs = new Map();

/* ─────────────────────────────────────────────────────────────
   SQL Logging Helper
   ───────────────────────────────────────────────────────────── */
let _logConnStr = null;

async function getLogPool() {
  // Use cached connection string if already resolved
  if (_logConnStr) {
    try {
      return await getPool(_logConnStr);
    } catch (e) {
      opsLogger.op('dataops:logpool:reconnect', { error: e.message });
      _logConnStr = null; // Reset so we re-resolve
    }
  }

  let connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const isUsable = connStr && !connStr.includes('***') && !connStr.includes('REDACTED') && !connStr.includes('<REDACTED>');

  if (!isUsable) {
    try {
      const password = await getSecret('instructions-sql-password');
      if (password) {
        connStr = `Server=tcp:instructions.database.windows.net,1433;Initial Catalog=instructions;Persist Security Info=False;User ID=instructionsadmin;Password=${password};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
      } else {
        console.warn('[DataOps] instructions-sql-password returned empty from Key Vault');
        return null;
      }
    } catch (e) {
      console.warn('[DataOps] Could not fetch instructions-sql-password for logging:', e.message);
      return null;
    }
  }

  _logConnStr = connStr;
  return getPool(connStr);
}

async function logToSql(entry) {
  try {
    const pool = await getLogPool();
    if (!pool) {
      console.warn('[DataOps] logToSql skipped: no pool available');
      return;
    }

    // Map fields
    const entity = entry.operation?.includes('Collected') ? 'CollectedTime' : 
                   entry.operation?.includes('Wip') ? 'Wip' : 
                   entry.entity || null;
    
    const start = entry.startDate || null;
    const end = entry.endDate || null;

    await pool.request()
        .input('jobId', entry.jobId || null)
        .input('operation', entry.operation || 'unknown')
        .input('entity', entity)
        .input('sourceSystem', entry.sourceSystem || 'Clio')
        .input('direction', entry.direction || 'Inbound')
        .input('status', entry.status || 'unknown')
        .input('message', (entry.message || '').substring(0, 500))
        .input('startDate', start)
        .input('endDate', end)
        .input('deletedRows', entry.deletedRows ?? null)
        .input('insertedRows', entry.insertedRows ?? null)
        .input('changedRows', entry.changedRows ?? null)
        .input('durationMs', entry.durationMs ?? null)
        .input('triggeredBy', entry.triggeredBy || 'manual')
        .input('invokedBy', entry.invokedBy || null)
        .query(`
            INSERT INTO dataOpsLog 
            (ts, jobId, operation, entity, sourceSystem, direction, status, message, startDate, endDate, deletedRows, insertedRows, changedRows, durationMs, triggeredBy, invokedBy)
            VALUES 
            (SYSUTCDATETIME(), @jobId, @operation, @entity, @sourceSystem, @direction, @status, @message, @startDate, @endDate, @deletedRows, @insertedRows, @changedRows, @durationMs, @triggeredBy, @invokedBy)
        `);
  } catch (err) {
    console.error('[DataOps] SQL Log failed:', err.message, '| entry:', entry.operation, entry.status);
  }
}

function logOperation(entry) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    ...entry,
  };
  
  // Update in-memory log
  operationLog.unshift(record);
  if (operationLog.length > MAX_LOG_ENTRIES) {
    operationLog.pop();
  }

  // Persist to SQL (fire and forget)
  logToSql(entry).catch(e => console.error(e));

  console.log(`[DataOps] ${entry.operation} ${entry.status}`, entry.message || '');
  opsLogger.op(`dataops:${entry.operation}:${entry.status}`, {
    message: entry.message,
    daysBack: entry.daysBack,
    deletedRows: entry.deletedRows,
    insertedRows: entry.insertedRows,
    durationMs: entry.durationMs,
  });
  return record;
}

function logProgress(operation, message, extra = {}) {
  return logOperation({ operation, status: 'progress', message, ...extra });
}

function resolveCollectedOperationKey(daysBack) {
  if (daysBack === 0) return 'syncCollectedTimeDaily';
  if (daysBack === 7) return 'syncCollectedTimeRolling7d';
  return 'syncCollectedTime';
}

// ─────────────────────────────────────────────────────────────
// Clio OAuth Helper (uses Key Vault, same as other routes)
// Uses 'pbi' (Power BI / data operations) credentials from Key Vault
// ─────────────────────────────────────────────────────────────
const tokenCache = new Map();

async function getClioAccessToken(forceRefresh = false) {
  const key = 'pbi'; // Power BI / data operations credentials

  if (!forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
  } else {
    tokenCache.delete(key);
  }

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getSecret(`${key}-clio-v1-clientid`),
    getSecret(`${key}-clio-v1-clientsecret`),
    getSecret(`${key}-clio-v1-refreshtoken`),
  ]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Missing Clio credentials in Key Vault for '${key}' (pbi-clio-v1-clientid, pbi-clio-v1-clientsecret, pbi-clio-v1-refreshtoken)`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://eu.app.clio.com/oauth/token?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio OAuth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in || 3600) * 1000;

  tokenCache.set(key, {
    token: accessToken,
    expiresAt: Date.now() + expiresIn - 60000, // 1 min buffer
  });

  return accessToken;
}

// ─────────────────────────────────────────────────────────────
// Collected Time Sync
// ─────────────────────────────────────────────────────────────
async function syncCollectedTime(options = {}) {
  const { daysBack, startDate: customStart, endDate: customEnd, dryRun = false, mode = 'replace' } = options;
  const startedAt = Date.now();
  
  // Resolve Date Range
  let startDateSql, endDateSql, startDateApi, endDateApi;
  let operationKey = 'syncCollectedTime';
  let deleteColumn = 'payment_date'; // Default for safety

  if (customStart && customEnd) {
    startDateSql = customStart.slice(0, 10);
    endDateSql = customEnd.slice(0, 10);
    // Ensure API range covers full days in UTC if needed, but strings are safest
    startDateApi = new Date(customStart).toISOString();
    
    const endD = new Date(customEnd);
    endD.setHours(23, 59, 59, 999);
    endDateApi = endD.toISOString();
    
    operationKey = `syncCollectedTimeCustom_${startDateSql}`;
  } else {
    // Legacy daysBack mode
    const dBack = typeof daysBack === 'number' ? daysBack : 0;
    operationKey = resolveCollectedOperationKey(dBack);
    deleteColumn = 'payment_date'; // Always delete by payment_date — 'date' mismatch caused duplicates
    
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - dBack);
    startDate.setHours(0, 0, 0, 0);

    startDateApi = startDate.toISOString();
    endDateApi = endDate.toISOString();
    startDateSql = startDate.toISOString().slice(0, 10);
    endDateSql = endDate.toISOString().slice(0, 10);
  }

  // Register job for cancellation
  activeJobs.set(operationKey, { cancelled: false, startedAt });

  const safeMode = mode === 'delete' || mode === 'insert' || mode === 'replace' ? mode : 'replace';
  const shouldDelete = safeMode !== 'insert';
  const shouldInsert = safeMode !== 'delete';

  logOperation({ 
    operation: operationKey, 
    status: 'started', 
    daysBack, 
    message: dryRun
      ? `Planning sync ${startDateSql} → ${endDateSql} (${safeMode})`
      : `Syncing ${startDateSql} → ${endDateSql} (${safeMode})` 
  });

  try {
    let accessToken = await getClioAccessToken();
    logProgress(operationKey, 'Access token ready');

    // Check cancellation
    if (activeJobs.get(operationKey)?.cancelled) throw new Error('Operation cancelled by user');

    // Request Clio report
    logProgress(operationKey, `Requesting report for ${startDateSql} → ${endDateSql}`);

    const makeReportRequest = async (token) => {
      return fetch('https://eu.app.clio.com/api/v4/reports.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            start_date: startDateApi,
            end_date: endDateApi,
            format: 'json',
            kind: 'invoice_payments_v2',
          },
        }),
      });
    };

    let reportRes = await makeReportRequest(accessToken);

    if (reportRes.status === 401) {
      logProgress(operationKey, 'Access token expired (401). Refreshing...');
      accessToken = await getClioAccessToken(true);
      reportRes = await makeReportRequest(accessToken);
    }

    let downloadData = null;
    let reportId = null;
    let skipPolling = false;

    if (!reportRes.ok) {
      // Catch 422 Unprocessable Entity - often means "No data to report on"
      const text = await reportRes.text();
      if (text.includes('no data to report on')) {
        logProgress(operationKey, 'Clio reported no data. Treating as 0 rows.');
        downloadData = { report_data: {} };
        skipPolling = true;
      } else {
        throw new Error(`Clio report request failed: ${reportRes.status}`);
      }
    } else {
      const reportData = await reportRes.json();
      reportId = reportData?.data?.id;
      if (!reportId) throw new Error('No report ID returned from Clio');
      logProgress(operationKey, `Report queued (${reportId}). Waiting for generation...`);
    }

    if (!skipPolling) {
      // Poll for report completion
      const isSmallWindow = (customStart && customEnd) || (daysBack === 0);
      const pollInterval = isSmallWindow ? 4000 : 10000;
      const maxAttempts = isSmallWindow ? 30 : 60;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (activeJobs.get(operationKey)?.cancelled) throw new Error('Operation cancelled by user');
        await new Promise((r) => setTimeout(r, pollInterval));
        
        const dlRes = await fetch(`https://eu.app.clio.com/api/v4/reports/${reportId}/download`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (dlRes.status === 200) {
          logProgress(operationKey, 'Report generated. Downloading...');
          const possibleData = await dlRes.json();
          
          // Handle "No data" API Error hidden in 200 OK
          if (possibleData.error || (typeof possibleData === 'string' && possibleData.includes('no data'))) {
            logProgress(operationKey, 'Clio reported no data (in download). Treating as 0 rows.');
            downloadData = { report_data: {} };
          } else {
            downloadData = possibleData;
          }
          break;
        } else if (dlRes.status === 404 || dlRes.status === 202) {
          logProgress(operationKey, `Waiting for report generation... (poll ${attempt + 1}/${maxAttempts})`);
        } else if (dlRes.status === 401) {
          logProgress(operationKey, 'Token expired during poll. Refreshing...');
          accessToken = await getClioAccessToken(true);
        } else {
          // Some errors are just empty states
          const text = await dlRes.text();
          if (text.includes('no data')) {
            logProgress(operationKey, 'Clio download indicated no data. Treating as 0 rows.');
            downloadData = { report_data: {} };
            break;
          }
          logProgress(operationKey, `Unexpected status ${dlRes.status}. Retrying...`);
        }
      }

      if (!downloadData?.report_data) {
        throw new Error('Report generation timed out with no data payload');
      }
    }

    // Connect to SQL
    logProgress(operationKey, 'Connecting to SQL database...');
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    // ************ DRY RUN MODE ************
    if (dryRun) {
      // Count rows that WOULD be deleted
      logProgress(operationKey, 'Calculating impact (Dry Run)...');
      let rowsToDelete = 0;
      if (shouldDelete) {
        const countRes = await pool
          .request()
          .input('startDate', startDateSql)
          .input('endDate', endDateSql)
          .query(`SELECT COUNT(*) as cnt FROM collectedTime WHERE ${deleteColumn} >= @startDate AND ${deleteColumn} <= @endDate`);
        rowsToDelete = countRes.recordset[0].cnt;
      }

      // Count rows that WOULD be inserted
      let rowsToInsert = 0;
      if (shouldInsert && downloadData && downloadData.report_data) {
        const matterEntries = Object.entries(downloadData.report_data);
        for (const [, matterData] of matterEntries) {
          if (!matterData.bill_data || !matterData.matter_payment_data || !matterData.line_items_data) continue;
          const items = matterData.line_items_data.line_items || [];
          rowsToInsert += items.length;
        }
      }
      
      const durationMs = Date.now() - startedAt;
      logOperation({
        operation: operationKey,
        status: 'completed',
        message: `Plan: Replace ${rowsToDelete} rows with ${rowsToInsert} rows`,
        durationMs
      });

      activeJobs.delete(operationKey);
      return {
        success: true,
        dryRun: true,
        plan: {
          startDate: startDateSql,
          endDate: endDateSql,
          rowsToDelete,
          rowsToInsert,
          message: safeMode === 'delete'
            ? `This will delete ${rowsToDelete} existing records from ${startDateSql} to ${endDateSql}.`
            : safeMode === 'insert'
              ? `This will insert ${rowsToInsert} new records from Clio for ${startDateSql} to ${endDateSql}.`
              : `This will delete ${rowsToDelete} existing records from ${startDateSql} to ${endDateSql} and insert ${rowsToInsert} new records from Clio.`
        }
      };
    }
    // **************************************

    // Delete existing records in date range
    let deletedRows = 0;
    if (shouldDelete) {
      logProgress(operationKey, `Clearing collectedTime data for ${deleteColumn} between ${startDateSql} and ${endDateSql}`);
      const deleteResult = await pool
        .request()
        .input('startDate', startDateSql)
        .input('endDate', endDateSql)
        .query(`DELETE FROM collectedTime WHERE ${deleteColumn} >= @startDate AND ${deleteColumn} <= @endDate`);

      deletedRows = deleteResult.rowsAffected[0] || 0;
      logProgress(operationKey, `Successfully deleted ${deletedRows} rows.`);
    } else {
      logProgress(operationKey, 'Skipping delete step (insert-only).');
    }

    // Insert new records
    let insertedRows = 0;
    let skippedRows = 0;
    
    if (shouldInsert && downloadData && downloadData.report_data) {
        // Convert report object to array for counting
        const matterEntries = Object.entries(downloadData.report_data);
        const totalMatters = matterEntries.length;
        
        if (totalMatters > 500) {
        logProgress(operationKey, `Processing ${totalMatters} matters...`);
        }

        for (const [, matterData] of matterEntries) {
        if (!matterData.bill_data || !matterData.matter_payment_data || !matterData.line_items_data) {
            skippedRows++;
            continue;
        }

        const billId = matterData.bill_data.bill_id;
        const contactId = matterData.matter_payment_data.contact_id;
        const matterId = matterData.matter_payment_data.matter_id;
        const paymentDate = matterData.matter_payment_data.date;

        for (const item of matterData.line_items_data.line_items || []) {
            try {
            await pool
                .request()
                .input('matter_id', matterId)
                .input('bill_id', billId)
                .input('contact_id', contactId)
                .input('id', item.id)
                .input('date', item.date)
                .input('created_at', item.created_at ? new Date(item.created_at) : null)
                .input('kind', item.kind)
                .input('type', item.type)
                .input('activity_type', item.activity_type)
                .input('description', item.description)
                .input('sub_total', item.sub_total)
                .input('tax', item.tax)
                .input('secondary_tax', item.secondary_tax)
                .input('user_id', item.user_id)
                .input('user_name', item.user_name)
                .input('payment_allocated', item.payment_allocated)
                .input('payment_date', paymentDate)
                .query(`
                INSERT INTO collectedTime (
                    matter_id, bill_id, contact_id, id, date, created_at, kind, type, activity_type,
                    description, sub_total, tax, secondary_tax, user_id, user_name, payment_allocated, payment_date
                ) VALUES (
                    @matter_id, @bill_id, @contact_id, @id, @date, @created_at, @kind, @type, @activity_type,
                    @description, @sub_total, @tax, @secondary_tax, @user_id, @user_name, @payment_allocated, @payment_date
                )
                `);
            insertedRows++;
            } catch (insertErr) {
            console.warn('[DataOps] Insert error:', insertErr.message);
            }
        }
        }
    }

    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'completed',
      daysBack,
      deletedRows,
      insertedRows,
      durationMs,
      message: `Deleted ${deletedRows}, inserted ${insertedRows}`,
    });
    
    activeJobs.delete(operationKey);
    return { success: true, deletedRows, insertedRows, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'error',
      message: error.message,
      durationMs,
    });
    activeJobs.delete(operationKey);
    throw error;
  }
}
// ─────────────────────────────────────────────────────────────
// WIP (Recorded Time) Sync
// ─────────────────────────────────────────────────────────────
async function syncWip(options = {}) {
  const { daysBack = 7, startDate: customStart, endDate: customEnd } = options;
  const startedAt = Date.now();

  let operationKey = 'syncWipRolling7d';
  let startDateApi;
  let endDateApi;
  let startDateSql;
  let endDateSql;

  if (customStart && customEnd) {
    startDateApi = new Date(customStart).toISOString();
    const endD = new Date(customEnd);
    endD.setHours(23, 59, 59, 999);
    endDateApi = endD.toISOString();
    startDateSql = new Date(customStart).toISOString().slice(0, 10);
    endDateSql = new Date(customEnd).toISOString().slice(0, 10);
    operationKey = `syncWipCustom_${startDateSql}`;
  } else {
    if (daysBack === 0) {
      operationKey = 'syncWipDaily';
    } else if (daysBack === 7) {
      operationKey = 'syncWipRolling7d';
    } else {
      operationKey = `syncWipRolling${daysBack}d`;
    }
  }

  logOperation({ operation: operationKey, status: 'started', daysBack, message: 'Sync started' });

  try {
    let accessToken = await getClioAccessToken();
    logProgress(operationKey, 'Access token ready');

    // Calculate date range if not provided
    if (!startDateApi || !endDateApi || !startDateSql || !endDateSql) {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setHours(0, 0, 0, 0);

      startDateApi = startDate.toISOString();
      endDateApi = endDate.toISOString();
      startDateSql = startDate.toISOString().slice(0, 10);
      endDateSql = endDate.toISOString().slice(0, 10);
    }

    // Fetch activities from Clio (paginated)
    const activities = [];
    let offset = 0;
    const limit = 200;

    while (true) {
      const url = new URL('https://eu.app.clio.com/api/v4/activities.json');
      url.searchParams.set('fields', 'id,date,created_at,updated_at,type,matter,quantity_in_hours,note,total,price,expense_category,activity_description,user,bill,billed');
      url.searchParams.set('start_date', startDateApi);
      url.searchParams.set('end_date', endDateApi);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));

      const makeRequest = async (token) => {
        return fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
      };

      let res = await makeRequest(accessToken);

      if (res.status === 401) {
        logProgress(operationKey, 'Access token expired (401). Refreshing...');
        accessToken = await getClioAccessToken(true);
        res = await makeRequest(accessToken);
      }

      if (!res.ok) {
        throw new Error(`Clio activities fetch failed: ${res.status}`);
      }

      const data = await res.json();
      const batch = data.data || [];
      activities.push(...batch);

      logProgress(operationKey, `Fetched ${batch.length} activities (offset ${offset})`);

      if (batch.length < limit || !data.meta?.paging?.next) break;
      offset += limit;
    }

    // Connect to SQL
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    // Delete existing records in date range
    logProgress(operationKey, `Clearing date between ${startDateSql} and ${endDateSql}`);
    const deleteResult = await pool
      .request()
      .input('startDate', startDateSql)
      .input('endDate', endDateSql)
      .query(`DELETE FROM wip WHERE date >= @startDate AND date <= @endDate`);

    const deletedRows = deleteResult.rowsAffected[0] || 0;

    // Insert new records
    let insertedRows = 0;
    for (const record of activities) {
      try {
        const createdAt = record.created_at ? new Date(record.created_at) : null;
        const updatedAt = record.updated_at ? new Date(record.updated_at) : null;

        await pool
          .request()
          .input('id', record.id)
          .input('date', record.date)
          .input('created_at_date', createdAt ? createdAt.toISOString().slice(0, 10) : null)
          .input('created_at_time', createdAt ? createdAt.toISOString().slice(11, 19) : null)
          .input('updated_at_date', updatedAt ? updatedAt.toISOString().slice(0, 10) : null)
          .input('updated_at_time', updatedAt ? updatedAt.toISOString().slice(11, 19) : null)
          .input('type', record.type)
          .input('matter_id', record.matter?.id || null)
          .input('matter_display_number', record.matter?.display_number || null)
          .input('quantity_in_hours', record.quantity_in_hours || 0)
          .input('note', record.note || '')
          .input('total', record.total || null)
          .input('price', record.price || 0)
          .input('expense_category', record.expense_category ? `id: ${record.expense_category.id}, name: ${record.expense_category.name}` : null)
          .input('activity_description_id', record.activity_description?.id || null)
          .input('activity_description_name', record.activity_description?.name || null)
          .input('user_id', record.user?.id || null)
          .input('bill_id', record.bill?.id || null)
          .input('billed', record.billed ? 1 : 0)
          .query(`
            INSERT INTO wip (
              id, date, created_at_date, created_at_time, updated_at_date, updated_at_time,
              type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
              expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed
            ) VALUES (
              @id, @date, @created_at_date, @created_at_time, @updated_at_date, @updated_at_time,
              @type, @matter_id, @matter_display_number, @quantity_in_hours, @note, @total, @price,
              @expense_category, @activity_description_id, @activity_description_name, @user_id, @bill_id, @billed
            )
          `);
        insertedRows++;
      } catch (insertErr) {
        console.warn('[DataOps] WIP insert error:', insertErr.message);
      }
    }

    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'completed',
      daysBack,
      deletedRows,
      insertedRows,
      durationMs,
      message: `Deleted ${deletedRows}, inserted ${insertedRows}`,
    });

    return { success: true, deletedRows, insertedRows, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'error',
      message: error.message,
      durationMs,
    });
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

router.post('/abort', (req, res) => {
    const { operationKey } = req.body;
    let count = 0;
    
    if (operationKey) {
        if (activeJobs.has(operationKey)) {
            activeJobs.get(operationKey).cancelled = true;
            count = 1;
        }
    } else {
        // Cancel all
        for (const job of activeJobs.values()) {
            job.cancelled = true;
            count++;
        }
    }
    
    logProgress('abort', `Signal sent to cancel ${count} active jobs`);
    res.json({ success: true, count });
});

/**
 * GET /api/data-operations/log
 * Returns recent operation history
 */
router.get('/log', (req, res) => {
  res.json({ operations: operationLog });
});

/**
 * GET /api/data-operations/status
 * Returns summary of operation status
 */
router.get('/status', async (req, res) => {
  try {
    const connStr = process.env.SQL_CONNECTION_STRING;
    const pool = connStr ? await getPool(connStr) : null;

    let collectedTimeCount = null;
    let wipCount = null;
    let collectedTimeLatest = null;
    let wipLatest = null;

    if (pool) {
      try {
        const ctResult = await pool.request().query(`
          SELECT COUNT(*) as cnt, MAX(payment_date) as latest FROM collectedTime
        `);
        collectedTimeCount = ctResult.recordset[0]?.cnt || 0;
        collectedTimeLatest = ctResult.recordset[0]?.latest || null;
      } catch (e) {
        console.warn('[DataOps] Could not query collectedTime:', e.message);
      }

      try {
        const wipResult = await pool.request().query(`
          SELECT COUNT(*) as cnt, MAX(date) as latest FROM wip
        `);
        wipCount = wipResult.recordset[0]?.cnt || 0;
        wipLatest = wipResult.recordset[0]?.latest || null;
      } catch (e) {
        console.warn('[DataOps] Could not query wip:', e.message);
      }
    }

    const lastCollectedDailySync = operationLog.find(
      (o) => o.operation === 'syncCollectedTimeDaily' && o.status === 'completed'
    );
    const lastCollectedRollingSync = operationLog.find(
      (o) => o.operation === 'syncCollectedTimeRolling7d' && o.status === 'completed'
    );
    const lastWipSync = [...operationLog]
      .filter((o) => o.operation?.startsWith('syncWip') && o.status === 'completed')
      .sort((a, b) => b.ts - a.ts)[0];

    res.json({
      collectedTime: {
        rowCount: collectedTimeCount,
        latestDate: collectedTimeLatest,
        lastDailySync: lastCollectedDailySync || null,
        lastRollingSync: lastCollectedRollingSync || null,
      },
      wip: {
        rowCount: wipCount,
        latestDate: wipLatest,
        lastSync: lastWipSync || null,
      },
      recentOperations: operationLog.slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data-operations/sync-collected
 * Manually trigger collected time sync
 * Body: { daysBack?: number } (default 7)
 */
router.post('/sync-collected', async (req, res) => {
  const { daysBack = 7, startDate, endDate, dryRun, mode } = req.body || {};
  try {
    const result = await syncCollectedTime({ daysBack, startDate, endDate, dryRun, mode });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/data-operations/sync-wip
 * Manually trigger WIP/recorded time sync
 * Body: { daysBack?: number } (default 7)
 */
router.post('/sync-wip', async (req, res) => {
  const { daysBack = 7, startDate, endDate } = req.body || {};
  try {
    const result = await syncWip({ daysBack, startDate, endDate });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/validate
 * Returns validation metrics: last run time, row counts (SQL), and coverage checks.
 */
router.get('/validate', async (req, res) => {
  const { operation, startDate, endDate, deep } = req.query;
  const isDeep = deep === 'true';
  // Map operation to table entity
  const table = operation?.includes('Collected') ? 'collectedTime' : 
                operation?.includes('Wip') ? 'wip' : null;

  console.log(`[Validate] operation=${operation} table=${table} deep=${deep} isDeep=${isDeep}`);
                
  if (!table || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing operation, startDate, or endDate' });
  }

  try {
    const logPool = await getLogPool();
    
    // 1. Get Last Run from Log (Instructions DB)
    let lastRun = null;
    
    if (logPool) {
        const logRes = await logPool.request()
        .input('op', operation)
        .input('status', 'completed')
        .query(`
            SELECT TOP 1 * FROM dataOpsLog 
            WHERE operation = @op AND status = @status 
            ORDER BY ts DESC
        `);
        lastRun = logRes.recordset[0] || null;
    }

    // 2. Get Data Counts (Core DB)
    const coreConnStr = process.env.SQL_CONNECTION_STRING;
    let sqlCount = 0;
    let totalRows = 0;
    let uniqueIds = 0;
    let sqlSum = null;
    let spotChecks = [];
    
    if (coreConnStr) {
        const pool = await getPool(coreConnStr);
        const dateCol = table === 'collectedTime' ? 'payment_date' : 'date';
        
        if (table === 'collectedTime') {
            const countRes = await pool.request()
                .input('start', startDate)
                .input('end', endDate)
                .query(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(DISTINCT id) as unique_ids,
                        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total_sum
                    FROM collectedTime 
                    WHERE ${dateCol} >= @start AND ${dateCol} <= @end
                `);
            totalRows = countRes.recordset[0].total;
            uniqueIds = countRes.recordset[0].unique_ids;
            sqlCount = uniqueIds;
            sqlSum = parseFloat(countRes.recordset[0].total_sum) || 0;

            // Spot-check: known users for cross-reference
            const spotCheckUsers = [
                { userId: 137557, name: 'Jonathan Waters' },
            ];
            for (const u of spotCheckUsers) {
                const scRes = await pool.request()
                    .input('uid', u.userId)
                    .input('start', startDate)
                    .input('end', endDate)
                    .query(`
                        SELECT 
                            COUNT(DISTINCT id) as rows,
                            ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total
                        FROM collectedTime 
                        WHERE user_id = @uid AND ${dateCol} >= @start AND ${dateCol} <= @end
                    `);
                spotChecks.push({
                    name: u.name,
                    userId: u.userId,
                    rows: scRes.recordset[0].rows,
                    total: parseFloat(scRes.recordset[0].total) || 0,
                });
            }
        } else {
            const countRes = await pool.request()
                .input('start', startDate)
                .input('end', endDate)
                .query(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${dateCol} >= @start AND ${dateCol} <= @end`);
            sqlCount = countRes.recordset[0].cnt;
            totalRows = sqlCount;
            uniqueIds = sqlCount;
        }
    }

    // 3. Get Clio Data
    let clioCount = null;
    let clioSum = null;
    try {
        if (table === 'wip') {
            // WIP: cheap REST API count
            const accessToken = await getClioAccessToken();
            const headers = { Authorization: `Bearer ${accessToken}` };
            const sDate = startDate.slice(0, 10);
            const eDate = endDate.slice(0, 10);

            let total = 0;
            let offset = 0;
            const limit = 200;
            let hasMore = true;
             
            while (hasMore) {
                const url = `https://eu.app.clio.com/api/v4/activities.json?start_date=${sDate}&end_date=${eDate}&fields=id&limit=${limit}&offset=${offset}`;
                console.log(`[Validate] Clio WIP fetch: ${url}`);
                const apiRes = await fetch(url, { headers });
                if (!apiRes.ok) {
                    console.warn(`[Validate] Clio WIP fetch failed: ${apiRes.status} ${apiRes.statusText}`);
                    break;
                }
                 
                const json = await apiRes.json();
                const data = json.data || [];
                total += data.length;
                console.log(`[Validate] Clio WIP batch: ${data.length} activities (offset ${offset}, total so far ${total})`);
                 
                hasMore = data.length === limit && !!json.meta?.paging?.next;
                offset += limit;
            }
            clioCount = total;
        } else if (table === 'collectedTime' && isDeep) {
            // Collected: deep validate via Reports API (slow — 30-60s)
            console.log(`[Validate] ENTERING deep collected branch: ${startDate} → ${endDate}`);
            let accessToken = await getClioAccessToken();

            const sDateApi = new Date(startDate).toISOString();
            const eDateObj = new Date(endDate);
            eDateObj.setHours(23, 59, 59, 999);
            const eDateApi = eDateObj.toISOString();

            // Request report
            let reportRes = await fetch('https://eu.app.clio.com/api/v4/reports.json', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: {
                        start_date: sDateApi,
                        end_date: eDateApi,
                        format: 'json',
                        kind: 'invoice_payments_v2',
                    },
                }),
            });

            if (reportRes.status === 401) {
                accessToken = await getClioAccessToken(true);
                reportRes = await fetch('https://eu.app.clio.com/api/v4/reports.json', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        data: { start_date: sDateApi, end_date: eDateApi, format: 'json', kind: 'invoice_payments_v2' },
                    }),
                });
            }

            let downloadData = null;
            let reportId = null;
            let skipPolling = false;

            if (!reportRes.ok) {
                const text = await reportRes.text();
                if (text.includes('no data to report on')) {
                    downloadData = { report_data: {} };
                    skipPolling = true;
                    console.log('[Validate] Clio reported no collected data for this range.');
                } else {
                    console.warn(`[Validate] Clio report request failed: ${reportRes.status}`);
                }
            } else {
                const reportData = await reportRes.json();
                reportId = reportData?.data?.id;
                if (reportId) {
                    console.log(`[Validate] Report queued (${reportId}). Polling...`);
                }
            }

            if (!skipPolling && reportId) {
                const pollInterval = 4000;
                const maxAttempts = 30;

                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    await new Promise((r) => setTimeout(r, pollInterval));
                    const dlRes = await fetch(`https://eu.app.clio.com/api/v4/reports/${reportId}/download`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });

                    if (dlRes.status === 200) {
                        const possibleData = await dlRes.json();
                        if (possibleData.error || (typeof possibleData === 'string' && possibleData.includes('no data'))) {
                            downloadData = { report_data: {} };
                        } else {
                            downloadData = possibleData;
                        }
                        console.log(`[Validate] Report downloaded after ${attempt + 1} polls`);
                        break;
                    } else if (dlRes.status === 401) {
                        accessToken = await getClioAccessToken(true);
                    } else if (dlRes.status !== 404 && dlRes.status !== 202) {
                        const text = await dlRes.text();
                        if (text.includes('no data')) {
                            downloadData = { report_data: {} };
                            break;
                        }
                    }
                }
            }

            // Count line items + sum from report
            if (downloadData?.report_data) {
                let total = 0;
                let sum = 0;
                const perUser = {}; // { userId: { rows, total } }
                for (const [, matterData] of Object.entries(downloadData.report_data)) {
                    if (!matterData.bill_data || !matterData.matter_payment_data || !matterData.line_items_data) continue;
                    const items = matterData.line_items_data.line_items || [];
                    total += items.length;
                    for (const item of items) {
                        const pa = parseFloat(item.payment_allocated) || 0;
                        sum += pa;
                        if (item.user_id) {
                            if (!perUser[item.user_id]) perUser[item.user_id] = { rows: 0, total: 0 };
                            perUser[item.user_id].rows++;
                            perUser[item.user_id].total += pa;
                        }
                    }
                }
                clioCount = total;
                clioSum = parseFloat(sum.toFixed(2));
                // Merge Clio per-user data into spotChecks
                for (const sc of spotChecks) {
                    const cu = perUser[sc.userId];
                    sc.clioRows = cu ? cu.rows : 0;
                    sc.clioTotal = cu ? parseFloat(cu.total.toFixed(2)) : 0;
                }
                console.log(`[Validate] Deep collected: ${total} line items, £${clioSum}`);
            }
        }
        // collectedTime without deep: clioCount stays null → UI shows prompt to deep validate
    } catch (e) {
        console.warn('Clio validation fetch failed', e);
    }

    // 4. Return report
    res.json({
        lastRun,
        sqlCount,
        clioCount,
        totalRows,
        uniqueIds,
        sqlSum,
        clioSum,
        spotChecks,
        match: (clioCount !== null) && (sqlCount === clioCount),
        deep: isDeep,
    });
    
  } catch (err) {
    console.error('Validation failed', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data-operations/check-token
 * Verify Clio token can be retrieved from Key Vault
 */
router.get('/check-token', async (req, res) => {
  const startedAt = Date.now();
  try {
    const token = await getClioAccessToken(true); // force refresh to verify
    const durationMs = Date.now() - startedAt;
    res.json({
      success: true,
      message: 'Clio token retrieved successfully',
      tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : null,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    res.status(500).json({
      success: false,
      message: error.message,
      durationMs,
    });
  }
});

/**
 * GET /api/data-operations/preview/:table
 * Preview rows from a data table
 * Query params: limit (default 20)
 */
router.get('/preview/:table', async (req, res) => {
  const { table } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  // Whitelist of allowed tables
  const allowedTables = [
    'collectedTime',
    'wip',
    'enquiries',
    'matters',
    'team',
    'poid',
    'annualLeave',
    'deals',
    'instructions',
  ];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: `Table '${table}' not allowed. Allowed: ${allowedTables.join(', ')}` });
  }

  try {
    const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    const coreConnStr = process.env.SQL_CONNECTION_STRING;

    const tableConfig = {
      collectedTime: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM collectedTime ORDER BY payment_date DESC, created_at DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM collectedTime`,
      },
      wip: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM wip ORDER BY date DESC, created_at_date DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM wip`,
      },
      enquiries: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM enquiries ORDER BY Touchpoint_Date DESC, ID DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM enquiries`,
      },
      matters: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM matters ORDER BY [Unique ID] DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM matters`,
      },
      team: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM team ORDER BY [Full Name]`,
        countQuery: `SELECT COUNT(*) as cnt FROM team`,
      },
      poid: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM poid ORDER BY submission_date DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM poid`,
      },
      annualLeave: {
        connectionString: coreConnStr,
        query: `SELECT TOP ${limit} * FROM annualLeave ORDER BY start_date DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM annualLeave`,
      },
      deals: {
        connectionString: instructionsConnStr,
        query: `SELECT TOP ${limit} * FROM Deals ORDER BY DealId DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM Deals`,
      },
      instructions: {
        connectionString: instructionsConnStr,
        query: `SELECT TOP ${limit} * FROM Instructions ORDER BY InstructionRef DESC`,
        countQuery: `SELECT COUNT(*) as cnt FROM Instructions`,
      },
    };

    const config = tableConfig[table];
    if (!config?.connectionString) {
      throw new Error(
        table === 'deals' || table === 'instructions'
          ? 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured'
          : 'SQL_CONNECTION_STRING not configured'
      );
    }

    const pool = await getPool(config.connectionString);
    const [result, countResult] = await Promise.all([
      pool.request().query(config.query),
      pool.request().query(config.countQuery),
    ]);
    const rows = result.recordset || [];
    const totalCount = countResult.recordset?.[0]?.cnt ?? rows.length;

    // Get column names from first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({
      table,
      rowCount: totalCount,
      columns,
      rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/table-stats
 * Get row counts and latest dates for key tables
 */
router.get('/table-stats', async (req, res) => {
  try {
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    const stats = {};

    // Collected Time
    try {
      const r = await pool.request().query(`
        SELECT COUNT(*) as cnt, MIN(payment_date) as earliest, MAX(payment_date) as latest 
        FROM collectedTime
      `);
      stats.collectedTime = {
        rowCount: r.recordset[0]?.cnt || 0,
        earliest: r.recordset[0]?.earliest || null,
        latest: r.recordset[0]?.latest || null,
      };
    } catch (e) {
      stats.collectedTime = { error: e.message };
    }

    // WIP
    try {
      const r = await pool.request().query(`
        SELECT COUNT(*) as cnt, MIN(date) as earliest, MAX(date) as latest 
        FROM wip
      `);
      stats.wip = {
        rowCount: r.recordset[0]?.cnt || 0,
        earliest: r.recordset[0]?.earliest || null,
        latest: r.recordset[0]?.latest || null,
      };
    } catch (e) {
      stats.wip = { error: e.message };
    }

    // Enquiries
    try {
      const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM enquiries`);
      stats.enquiries = { rowCount: r.recordset[0]?.cnt || 0 };
    } catch (e) {
      stats.enquiries = { error: e.message };
    }

    // Matters
    try {
      const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM matters`);
      stats.matters = { rowCount: r.recordset[0]?.cnt || 0 };
    } catch (e) {
      stats.matters = { error: e.message };
    }

    // Team
    try {
      const r = await pool.request().query(`SELECT COUNT(*) as cnt FROM team`);
      stats.team = { rowCount: r.recordset[0]?.cnt || 0 };
    } catch (e) {
      stats.team = { error: e.message };
    }

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/ops-log
 * Returns recent dataOpsLog entries, optionally filtered by operation
 */
router.get('/ops-log', async (req, res) => {
  const { operation, limit: rawLimit } = req.query;
  const limit = Math.min(parseInt(rawLimit) || 30, 100);

  try {
    const logPool = await getLogPool();
    if (!logPool) return res.json({ entries: [] });

    let query, result;
    if (operation) {
      // Filter by operation pattern (e.g. 'syncCollectedTime%')
      result = await logPool.request()
        .input('op', operation + '%')
        .input('limit', limit)
        .query(`SELECT TOP (@limit) * FROM dataOpsLog WHERE operation LIKE @op ORDER BY ts DESC`);
    } else {
      result = await logPool.request()
        .input('limit', limit)
        .query(`SELECT TOP (@limit) * FROM dataOpsLog ORDER BY ts DESC`);
    }

    res.json({ entries: result.recordset || [] });
  } catch (err) {
    console.error('[OpsLog] fetch failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  syncCollectedTime,
  syncWip,
  logOperation,
  logProgress,
};
