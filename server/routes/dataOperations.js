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
const { trackEvent, trackException, trackMetric, trackDependency } = require('../utils/appInsights');

const opsLogger = createLogger('DataOps');

const fmtMoneyBE = (v) => v == null ? '—' : `£${Number(v).toFixed(2)}`;

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
  const { daysBack, startDate: customStart, endDate: customEnd, dryRun = false, mode = 'replace', triggeredBy = 'manual', invokedBy = null } = options;
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
    triggeredBy,
    invokedBy,
    startDate: startDateSql,
    endDate: endDateSql,
    message: dryRun
      ? `Planning sync ${startDateSql} → ${endDateSql} (${safeMode})`
      : `Syncing ${startDateSql} → ${endDateSql} (${safeMode})` 
  });

  trackEvent('DataOps.CollectedTime.Started', {
    operation: operationKey, triggeredBy, invokedBy: invokedBy || '', daysBack: daysBack ?? '',
    startDate: startDateSql, endDate: endDateSql, mode: safeMode, dryRun,
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
      // Poll for report completion — scale by date range size
      const isCustomRange = !!(customStart && customEnd);
      const rangeDays = isCustomRange
        ? Math.ceil((new Date(customEnd) - new Date(customStart)) / 86400000)
        : (typeof daysBack === 'number' ? daysBack : 7);
      // All tiers get generous patience — Clio report generation is unpredictable.
      // ≤3 days: ~4 min, ≤31 days: ~8 min, >31 days: ~15 min
      const pollInterval = rangeDays <= 3 ? 4000 : rangeDays <= 31 ? 8000 : 10000;
      const maxAttempts = rangeDays <= 3 ? 60 : rangeDays <= 31 ? 60 : 90;

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
        // Clio simply had nothing to return — not an application error.
        const durationMs = Date.now() - startedAt;
        logOperation({
          operation: operationKey,
          status: 'no-data',
          message: `Clio returned no data for ${startDateSql} → ${endDateSql}`,
          durationMs,
          triggeredBy,
          invokedBy,
          startDate: startDateSql,
          endDate: endDateSql,
        });
        trackEvent('DataOps.CollectedTime.NoData', {
          operation: operationKey, triggeredBy, startDate: startDateSql, endDate: endDateSql, durationMs,
        });
        activeJobs.delete(operationKey);
        return { deletedRows: 0, insertedRows: 0, noData: true, message: `Clio returned no data for ${startDateSql} → ${endDateSql}` };
      }
    }

    // ── Safety: if Clio returned an empty report, preserve existing data ──
    // An empty report_data ({}) passes the null guard above but contains 0 rows.
    // Proceeding would DELETE existing records then INSERT nothing → data loss.
    const reportEntries = Object.entries(downloadData.report_data);
    const hasActualData = reportEntries.some(([, md]) => md.bill_data && md.matter_payment_data && md.line_items_data);
    if (!hasActualData && shouldDelete) {
      const durationMs = Date.now() - startedAt;
      logProgress(operationKey, `Clio report empty for ${startDateSql} → ${endDateSql}. Skipping delete to preserve existing data.`);
      logOperation({
        operation: operationKey,
        status: 'no-data',
        message: `Clio report empty for ${startDateSql} → ${endDateSql}. Existing data preserved.`,
        durationMs,
        triggeredBy,
        invokedBy,
        startDate: startDateSql,
        endDate: endDateSql,
        deletedRows: 0,
        insertedRows: 0,
      });
      trackEvent('DataOps.CollectedTime.EmptyReport', {
        operation: operationKey, triggeredBy, startDate: startDateSql, endDate: endDateSql, durationMs,
      });
      activeJobs.delete(operationKey);
      return { deletedRows: 0, insertedRows: 0, noData: true, preserved: true, message: `Clio report empty for ${startDateSql} → ${endDateSql}. Existing data preserved.` };
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

    // ── Transactional DELETE + INSERT ──
    // Wrapping in a SQL transaction so if the process crashes mid-insertion,
    // the DELETE rolls back and existing data is preserved.
    let deletedRows = 0;
    let insertedRows = 0;
    let skippedRows = 0;
    let dedupedRows = 0;

    const transaction = pool.transaction();
    await transaction.begin();
    logProgress(operationKey, 'Transaction started (DELETE + INSERT are atomic)');

    try {
      // Delete existing records in date range
      if (shouldDelete) {
        logProgress(operationKey, `Clearing collectedTime data for ${deleteColumn} between ${startDateSql} and ${endDateSql}`);
        const deleteResult = await transaction.request()
          .input('startDate', startDateSql)
          .input('endDate', endDateSql)
          .query(`DELETE FROM collectedTime WHERE ${deleteColumn} >= @startDate AND ${deleteColumn} <= @endDate`);

        deletedRows = deleteResult.rowsAffected[0] || 0;
        logProgress(operationKey, `Successfully deleted ${deletedRows} rows.`);
      } else {
        logProgress(operationKey, 'Skipping delete step (insert-only).');
      }

      // Insert new records — batched for performance
      if (shouldInsert && downloadData && downloadData.report_data) {
          // Flatten all line items into a single array first
          const matterEntries = Object.entries(downloadData.report_data);
          const allRows = [];
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
              allRows.push({ matterId, billId, contactId, paymentDate, item });
            }
          }

          const totalRows = allRows.length;
          logProgress(operationKey, `Inserting ${totalRows} rows...`);

          // Batch insert in chunks (limited by SQL Server's 2100 parameter cap: 17 cols × 100 = 1700)
          const BATCH_SIZE = 100;
          for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
            // Check cancellation between batches
            if (activeJobs.get(operationKey)?.cancelled) throw new Error('Operation cancelled by user');

            const batch = allRows.slice(batchStart, batchStart + BATCH_SIZE);
            try {
              const values = [];
              const req = transaction.request();
              for (let i = 0; i < batch.length; i++) {
                const { matterId, billId, contactId, paymentDate, item } = batch[i];
                const p = `p${i}_`;
                req.input(`${p}matter_id`, matterId);
                req.input(`${p}bill_id`, billId);
                req.input(`${p}contact_id`, contactId);
                req.input(`${p}id`, item.id);
                req.input(`${p}date`, item.date);
                req.input(`${p}created_at`, item.created_at ? new Date(item.created_at) : null);
                req.input(`${p}kind`, item.kind);
                req.input(`${p}type`, item.type);
                req.input(`${p}activity_type`, item.activity_type);
                req.input(`${p}description`, item.description || '');
                req.input(`${p}sub_total`, item.sub_total);
                req.input(`${p}tax`, item.tax);
                req.input(`${p}secondary_tax`, item.secondary_tax);
                req.input(`${p}user_id`, item.user_id);
                req.input(`${p}user_name`, item.user_name);
                req.input(`${p}payment_allocated`, item.payment_allocated);
                req.input(`${p}payment_date`, paymentDate);
                values.push(`(@${p}matter_id, @${p}bill_id, @${p}contact_id, @${p}id, @${p}date, @${p}created_at, @${p}kind, @${p}type, @${p}activity_type, @${p}description, @${p}sub_total, @${p}tax, @${p}secondary_tax, @${p}user_id, @${p}user_name, @${p}payment_allocated, @${p}payment_date)`);
              }
              await req.query(`
                INSERT INTO collectedTime (
                  matter_id, bill_id, contact_id, id, date, created_at, kind, type, activity_type,
                  description, sub_total, tax, secondary_tax, user_id, user_name, payment_allocated, payment_date
                ) VALUES ${values.join(',\n')}
              `);
              insertedRows += batch.length;
            } catch (batchErr) {
              // Fallback: insert individually so one bad row doesn't lose the batch
              console.warn(`[DataOps] Batch insert failed, falling back to individual inserts: ${batchErr.message}`);
              for (const { matterId, billId, contactId, paymentDate, item } of batch) {
                try {
                  await transaction.request()
                    .input('matter_id', matterId)
                    .input('bill_id', billId)
                    .input('contact_id', contactId)
                    .input('id', item.id)
                    .input('date', item.date)
                    .input('created_at', item.created_at ? new Date(item.created_at) : null)
                    .input('kind', item.kind)
                    .input('type', item.type)
                    .input('activity_type', item.activity_type)
                    .input('description', item.description || '')
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

            // Progress every 1000 rows
            if (insertedRows > 0 && (insertedRows % 1000 < BATCH_SIZE || batchStart + BATCH_SIZE >= totalRows)) {
              logProgress(operationKey, `Inserted ${insertedRows}/${totalRows} rows...`);
            }
          }
      }

      // ── Post-insert dedup (within same transaction) ──
      try {
        const dedupResult = await transaction.request()
          .input('dedupStart', startDateSql)
          .input('dedupEnd', endDateSql)
          .query(`
            ;WITH cte AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                ORDER BY (SELECT NULL)
              ) AS rn
              FROM collectedTime
              WHERE payment_date >= @dedupStart AND payment_date <= @dedupEnd
            )
            DELETE FROM cte WHERE rn > 1
          `);
        dedupedRows = dedupResult.rowsAffected[0] || 0;
        if (dedupedRows > 0) {
          console.log(`[DataOps] Deduped ${dedupedRows} duplicate rows from collectedTime`);
          insertedRows -= dedupedRows;
        }
      } catch (dedupErr) {
        console.warn('[DataOps] Post-insert dedup failed (non-fatal):', dedupErr.message);
      }

      // ── Commit sanity guard ──
      // If Clio returned drastically fewer rows than were deleted, something is
      // wrong (partial API response, timeout, auth issue). Rolling back preserves
      // the old data instead of committing a net loss.
      if (shouldDelete && deletedRows > 50 && insertedRows < deletedRows * 0.3) {
        await transaction.rollback();
        const msg = `Sanity guard: DELETE ${deletedRows} but only INSERT ${insertedRows} (${Math.round(insertedRows / deletedRows * 100)}%). Rolled back to preserve existing data.`;
        logProgress(operationKey, msg);
        trackEvent('DataOps.CollectedTime.SanityRollback', {
          operation: operationKey, triggeredBy, deletedRows, insertedRows,
          startDate: startDateSql, endDate: endDateSql,
        });
        throw new Error(msg);
      }

      // All good — commit
      await transaction.commit();
      logProgress(operationKey, `Transaction committed (−${deletedRows} +${insertedRows} rows)`);
    } catch (txErr) {
      // Rollback — old data preserved
      try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
      logProgress(operationKey, `Transaction rolled back — existing data preserved. Error: ${txErr.message}`);
      throw txErr; // Re-throw so the outer catch logs the error
    }

    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'completed',
      daysBack,
      deletedRows,
      insertedRows,
      durationMs,
      triggeredBy,
      invokedBy,
      startDate: startDateSql,
      endDate: endDateSql,
      message: `Deleted ${deletedRows}, inserted ${insertedRows}${dedupedRows > 0 ? ` (deduped ${dedupedRows})` : ''}`,
    });

    trackEvent('DataOps.CollectedTime.Completed', {
      operation: operationKey, triggeredBy, startDate: startDateSql, endDate: endDateSql,
      deletedRows, insertedRows, durationMs,
    });
    trackMetric('DataOps.CollectedTime.Duration', durationMs, { operation: operationKey, triggeredBy });
    trackMetric('DataOps.CollectedTime.RowsInserted', insertedRows, { operation: operationKey });

    // ── Post-sync auto-validation ──
    try {
      const coreConnStr = process.env.SQL_CONNECTION_STRING;
      if (coreConnStr) {
        const valPool = await getPool(coreConnStr);
        const valResult = await valPool.request()
          .input('start', startDateSql)
          .input('end', endDateSql)
          .query(`
            ;WITH deduped AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                ORDER BY (SELECT NULL)
              ) AS rn
              FROM collectedTime
              WHERE payment_date >= @start AND payment_date <= @end
            )
            SELECT COUNT(*) as total_rows, COUNT(DISTINCT id) as unique_ids,
              ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total_sum
            FROM deduped WHERE rn = 1
          `);
        const v = valResult.recordset[0];
        const splits = v.total_rows - v.unique_ids;

        // Kind breakdown for log message
        const kindResult = await valPool.request()
          .input('start', startDateSql)
          .input('end', endDateSql)
          .query(`
            ;WITH deduped AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                ORDER BY (SELECT NULL)
              ) AS rn
              FROM collectedTime
              WHERE payment_date >= @start AND payment_date <= @end
            )
            SELECT ISNULL(kind, 'Unknown') as kind,
              ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total
            FROM deduped WHERE rn = 1
            GROUP BY kind ORDER BY total DESC
          `);
        const kindParts = kindResult.recordset.map(r => `${r.kind} £${parseFloat(r.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(' · ');

        logOperation({
          operation: operationKey,
          status: 'validated',
          triggeredBy: 'auto',
          invokedBy: 'system',
          startDate: startDateSql,
          endDate: endDateSql,
          insertedRows: v.total_rows,
          message: `${v.unique_ids} payments · ${splits > 0 ? splits + ' splits · ' : ''}${kindParts}`,
        });

        trackEvent('DataOps.CollectedTime.Validated', {
          operation: operationKey, startDate: startDateSql, endDate: endDateSql,
          totalRows: v.total_rows, uniqueIds: v.unique_ids, totalSum: parseFloat(v.total_sum).toFixed(2),
        });
      }
    } catch (valErr) {
      console.warn('[DataOps] Post-sync validation failed:', valErr.message);
      trackException(valErr, { operation: operationKey, phase: 'validation', entity: 'CollectedTime' });
    }

    activeJobs.delete(operationKey);
    return { success: true, deletedRows, insertedRows, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'error',
      message: error.message,
      durationMs,
      triggeredBy,
      invokedBy,
      startDate: startDateSql,
      endDate: endDateSql,
    });

    trackException(error, {
      operation: operationKey, phase: 'sync', entity: 'CollectedTime',
      triggeredBy, startDate: startDateSql, endDate: endDateSql, durationMs: String(durationMs),
    });
    trackEvent('DataOps.CollectedTime.Failed', {
      operation: operationKey, triggeredBy, error: error.message,
      startDate: startDateSql, endDate: endDateSql, durationMs,
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

  const toSqlDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  const wipTriggeredBy = options.triggeredBy || 'manual';
  const wipInvokedBy = options.invokedBy || null;

  logOperation({ operation: operationKey, status: 'started', daysBack, triggeredBy: wipTriggeredBy, invokedBy: wipInvokedBy, message: 'Sync started' });

  trackEvent('DataOps.Wip.Started', {
    operation: operationKey, triggeredBy: wipTriggeredBy, invokedBy: wipInvokedBy || '',
    daysBack: daysBack ?? '', startDate: startDateSql || '', endDate: endDateSql || '',
  });

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

    // Safety guard: never write current-week WIP into SQL.
    // Current week is sourced live from Clio and merged separately in reporting.
    const requestedStart = new Date(`${startDateSql}T00:00:00`);
    const requestedEnd = new Date(`${endDateSql}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - daysSinceMonday);
    const lastSunday = new Date(currentWeekStart);
    lastSunday.setDate(currentWeekStart.getDate() - 1);

    if (requestedEnd >= currentWeekStart) {
      if (requestedStart > lastSunday) {
        const durationMs = Date.now() - startedAt;
        const skipMessage = `Skipped WIP sync for ${startDateSql} → ${endDateSql}: range is current week only.`;
        logProgress(operationKey, `${skipMessage} Current week remains API-only until next week.`);
        logOperation({
          operation: operationKey,
          status: 'skipped',
          message: skipMessage,
          durationMs,
          triggeredBy: wipTriggeredBy,
          invokedBy: wipInvokedBy,
          startDate: startDateSql,
          endDate: endDateSql,
          deletedRows: 0,
          insertedRows: 0,
        });
        trackEvent('DataOps.Wip.SkippedCurrentWeek', {
          operation: operationKey,
          triggeredBy: wipTriggeredBy,
          startDate: startDateSql,
          endDate: endDateSql,
          durationMs,
        });
        return {
          success: true,
          deletedRows: 0,
          insertedRows: 0,
          skipped: true,
          message: 'Current-week WIP is intentionally excluded from SQL sync.',
        };
      }

      const cappedEnd = new Date(lastSunday);
      cappedEnd.setHours(23, 59, 59, 999);
      const previousEnd = endDateSql;
      endDateSql = toSqlDate(lastSunday);
      endDateApi = cappedEnd.toISOString();
      logProgress(
        operationKey,
        `Capped WIP end date from ${previousEnd} to ${endDateSql} to exclude current week from SQL.`
      );
    }

    // Fetch activities from Clio (paginated)
    const activities = [];
    let offset = 0;
    const limit = 200;

    while (true) {
      const url = new URL('https://eu.app.clio.com/api/v4/activities.json');
      url.searchParams.set('fields', 'id,date,created_at,updated_at,type,matter,quantity_in_hours,note,total,price,expense_category,activity_description,user,bill,billed,non_billable');
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

    // ── Safety: if Clio returned 0 activities, preserve existing data ──
    // Proceeding would DELETE existing records then INSERT nothing → data loss.
    if (activities.length === 0) {
      const durationMs = Date.now() - startedAt;
      logProgress(operationKey, `Clio returned 0 activities for ${startDateSql} → ${endDateSql}. Skipping delete to preserve existing data.`);
      logOperation({
        operation: operationKey,
        status: 'no-data',
        message: `Clio returned 0 activities for ${startDateSql} → ${endDateSql}. Existing data preserved.`,
        durationMs,
        triggeredBy: wipTriggeredBy,
        invokedBy: wipInvokedBy,
        startDate: startDateSql,
        endDate: endDateSql,
        deletedRows: 0,
        insertedRows: 0,
      });
      trackEvent('DataOps.Wip.EmptyResponse', {
        operation: operationKey, triggeredBy: wipTriggeredBy, startDate: startDateSql, endDate: endDateSql, durationMs,
      });
      return { success: true, deletedRows: 0, insertedRows: 0, noData: true, preserved: true, message: `Clio returned 0 activities for ${startDateSql} → ${endDateSql}. Existing data preserved.` };
    }

    // Connect to SQL
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    // ── Transactional DELETE + INSERT ──
    // Wrapping in a SQL transaction so if the process crashes mid-insertion,
    // the DELETE rolls back and existing data is preserved.
    let deletedRows = 0;
    let insertedRows = 0;
    let dedupedRows = 0;

    const transaction = pool.transaction();
    await transaction.begin();
    logProgress(operationKey, 'Transaction started (DELETE + INSERT are atomic)');

    try {
      // Delete existing records in date range
      logProgress(operationKey, `Clearing date between ${startDateSql} and ${endDateSql}`);
      const deleteResult = await transaction.request()
        .input('startDate', startDateSql)
        .input('endDate', endDateSql)
        .query(`DELETE FROM wip WHERE date >= @startDate AND date <= @endDate`);

      deletedRows = deleteResult.rowsAffected[0] || 0;

      // Insert new records — batched for performance
      const totalActivities = activities.length;
      if (totalActivities > 0) {
        logProgress(operationKey, `Inserting ${totalActivities} rows...`);
      }
      const BATCH_SIZE = 100; // 20 cols × 100 = 2000 params (under SQL Server's 2100 limit)
      for (let batchStart = 0; batchStart < totalActivities; batchStart += BATCH_SIZE) {
        const batch = activities.slice(batchStart, batchStart + BATCH_SIZE);
        try {
          const values = [];
          const req = transaction.request();
          for (let i = 0; i < batch.length; i++) {
            const record = batch[i];
            const p = `p${i}_`;
            const createdAt = record.created_at ? new Date(record.created_at) : null;
            const updatedAt = record.updated_at ? new Date(record.updated_at) : null;
            req.input(`${p}id`, record.id);
            req.input(`${p}date`, record.date);
            req.input(`${p}created_at_date`, createdAt ? createdAt.toISOString().slice(0, 10) : null);
            req.input(`${p}created_at_time`, createdAt ? createdAt.toISOString().slice(11, 19) : null);
            req.input(`${p}updated_at_date`, updatedAt ? updatedAt.toISOString().slice(0, 10) : null);
            req.input(`${p}updated_at_time`, updatedAt ? updatedAt.toISOString().slice(11, 19) : null);
            req.input(`${p}type`, record.type);
            req.input(`${p}matter_id`, record.matter?.id || null);
            req.input(`${p}matter_display_number`, record.matter?.display_number || null);
            req.input(`${p}quantity_in_hours`, record.quantity_in_hours || 0);
            req.input(`${p}note`, record.note || '');
            req.input(`${p}total`, record.total || null);
            req.input(`${p}price`, record.price || 0);
            req.input(`${p}expense_category`, record.expense_category ? `id: ${record.expense_category.id}, name: ${record.expense_category.name}` : null);
            req.input(`${p}activity_description_id`, record.activity_description?.id || null);
            req.input(`${p}activity_description_name`, record.activity_description?.name || null);
            req.input(`${p}user_id`, record.user?.id || null);
            req.input(`${p}bill_id`, record.bill?.id || null);
            req.input(`${p}billed`, record.billed ? 1 : 0);
            req.input(`${p}non_billable`, record.non_billable ? 1 : 0);
            values.push(`(@${p}id, @${p}date, @${p}created_at_date, @${p}created_at_time, @${p}updated_at_date, @${p}updated_at_time, @${p}type, @${p}matter_id, @${p}matter_display_number, @${p}quantity_in_hours, @${p}note, @${p}total, @${p}price, @${p}expense_category, @${p}activity_description_id, @${p}activity_description_name, @${p}user_id, @${p}bill_id, @${p}billed, @${p}non_billable)`);
          }
          await req.query(`
            INSERT INTO wip (
              id, date, created_at_date, created_at_time, updated_at_date, updated_at_time,
              type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
              expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed, non_billable
            ) VALUES ${values.join(',\n')}
          `);
          insertedRows += batch.length;
        } catch (batchErr) {
          // Fallback: insert individually so one bad row doesn't lose the batch
          console.warn(`[DataOps] WIP batch insert failed, falling back: ${batchErr.message}`);
          for (const record of batch) {
            try {
              const createdAt = record.created_at ? new Date(record.created_at) : null;
              const updatedAt = record.updated_at ? new Date(record.updated_at) : null;
              await transaction.request()
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
                .input('non_billable', record.non_billable ? 1 : 0)
                .query(`
                  INSERT INTO wip (
                    id, date, created_at_date, created_at_time, updated_at_date, updated_at_time,
                    type, matter_id, matter_display_number, quantity_in_hours, note, total, price,
                    expense_category, activity_description_id, activity_description_name, user_id, bill_id, billed, non_billable
                  ) VALUES (
                    @id, @date, @created_at_date, @created_at_time, @updated_at_date, @updated_at_time,
                    @type, @matter_id, @matter_display_number, @quantity_in_hours, @note, @total, @price,
                    @expense_category, @activity_description_id, @activity_description_name, @user_id, @bill_id, @billed, @non_billable
                  )
                `);
              insertedRows++;
            } catch (insertErr) {
              console.warn('[DataOps] WIP insert error:', insertErr.message);
            }
          }
        }

        // Progress every ~1000 rows
        if (insertedRows > 0 && (insertedRows % 1000 < BATCH_SIZE || batchStart + BATCH_SIZE >= totalActivities)) {
          logProgress(operationKey, `Inserted ${insertedRows}/${totalActivities} rows...`);
        }
      }

      // ── Post-insert dedup (within same transaction) ──
      try {
        const dedupResult = await transaction.request()
          .input('dedupStart', startDateSql)
          .input('dedupEnd', endDateSql)
          .query(`
            ;WITH cte AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY id
                ORDER BY (SELECT NULL)
              ) AS rn
              FROM wip
              WHERE date >= @dedupStart AND date <= @dedupEnd
            )
            DELETE FROM cte WHERE rn > 1
          `);
        dedupedRows = dedupResult.rowsAffected[0] || 0;
        if (dedupedRows > 0) {
          console.log(`[DataOps] Deduped ${dedupedRows} duplicate rows from wip`);
          insertedRows -= dedupedRows;
        }
      } catch (dedupErr) {
        console.warn('[DataOps] WIP post-insert dedup failed (non-fatal):', dedupErr.message);
      }

      // ── Commit sanity guard ──
      // If Clio returned drastically fewer rows than were deleted, something is
      // wrong (partial API response, timeout, auth issue). Rolling back preserves
      // the old data instead of committing a net loss.
      if (deletedRows > 50 && insertedRows < deletedRows * 0.3) {
        await transaction.rollback();
        const msg = `Sanity guard: DELETE ${deletedRows} but only INSERT ${insertedRows} (${Math.round(insertedRows / deletedRows * 100)}%). Rolled back to preserve existing WIP data.`;
        logProgress(operationKey, msg);
        trackEvent('DataOps.Wip.SanityRollback', {
          operation: operationKey, triggeredBy: wipTriggeredBy, deletedRows, insertedRows,
          startDate: startDateSql, endDate: endDateSql,
        });
        throw new Error(msg);
      }

      // All good — commit
      await transaction.commit();
      logProgress(operationKey, `Transaction committed (−${deletedRows} +${insertedRows} rows)`);
    } catch (txErr) {
      // Rollback — old data preserved
      try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
      logProgress(operationKey, `Transaction rolled back — existing WIP data preserved. Error: ${txErr.message}`);
      throw txErr; // Re-throw so the outer catch logs the error
    }

    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'completed',
      daysBack,
      deletedRows,
      insertedRows,
      durationMs,
      triggeredBy: wipTriggeredBy,
      invokedBy: wipInvokedBy,
      message: `Deleted ${deletedRows}, inserted ${insertedRows}${dedupedRows > 0 ? ` (deduped ${dedupedRows})` : ''}`,
    });

    trackEvent('DataOps.Wip.Completed', {
      operation: operationKey, triggeredBy: wipTriggeredBy,
      startDate: startDateSql, endDate: endDateSql, deletedRows, insertedRows, durationMs,
    });
    trackMetric('DataOps.Wip.Duration', durationMs, { operation: operationKey, triggeredBy: wipTriggeredBy });
    trackMetric('DataOps.Wip.RowsInserted', insertedRows, { operation: operationKey });

    // ── Post-sync auto-validation ──
    try {
      const coreConnStr = process.env.SQL_CONNECTION_STRING;
      if (coreConnStr) {
        const valPool = await getPool(coreConnStr);
        const valResult = await valPool.request()
          .input('start', startDateSql)
          .input('end', endDateSql)
          .query(`
            SELECT COUNT(*) as total_rows, COUNT(DISTINCT id) as unique_ids,
              ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total_sum
            FROM wip
            WHERE date >= @start AND date <= @end
          `);
        const v = valResult.recordset[0];

        // Type breakdown + hours for log message
        const typeResult = await valPool.request()
          .input('start', startDateSql)
          .input('end', endDateSql)
          .query(`
            SELECT ISNULL(type, 'Unknown') as type,
              ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total_value,
              ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as hours
            FROM wip
            WHERE date >= @start AND date <= @end
            GROUP BY type ORDER BY total_value DESC
          `);
        const typeParts = typeResult.recordset.map(r => `${r.type} £${parseFloat(r.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(' · ');
        const totalHours = typeResult.recordset.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);

        logOperation({
          operation: operationKey,
          status: 'validated',
          triggeredBy: 'auto',
          invokedBy: 'system',
          startDate: startDateSql,
          endDate: endDateSql,
          insertedRows: v.total_rows,
          message: `${v.unique_ids} activities · ${totalHours.toFixed(1)}h · ${typeParts}`,
        });

        trackEvent('DataOps.Wip.Validated', {
          operation: operationKey, startDate: startDateSql, endDate: endDateSql,
          totalRows: v.total_rows, uniqueIds: v.unique_ids, totalSum: parseFloat(v.total_sum).toFixed(2),
        });
      }
    } catch (valErr) {
      console.warn('[DataOps] Post-sync WIP validation failed:', valErr.message);
      trackException(valErr, { operation: operationKey, phase: 'validation', entity: 'Wip' });
    }

    return { success: true, deletedRows, insertedRows, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logOperation({
      operation: operationKey,
      status: 'error',
      message: error.message,
      durationMs,
      triggeredBy: wipTriggeredBy,
      invokedBy: wipInvokedBy,
      startDate: startDateSql,
      endDate: endDateSql,
    });

    trackException(error, {
      operation: operationKey, phase: 'sync', entity: 'Wip',
      triggeredBy: wipTriggeredBy, startDate: startDateSql, endDate: endDateSql, durationMs: String(durationMs),
    });
    trackEvent('DataOps.Wip.Failed', {
      operation: operationKey, triggeredBy: wipTriggeredBy, error: error.message,
      startDate: startDateSql, endDate: endDateSql, durationMs,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - daysSinceMonday);
    const currentWeekStartSql = `${currentWeekStart.getFullYear()}-${String(currentWeekStart.getMonth() + 1).padStart(2, '0')}-${String(currentWeekStart.getDate()).padStart(2, '0')}`;

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
        const wipResult = await pool
          .request()
          .input('currentWeekStart', currentWeekStartSql)
          .query(`
            SELECT COUNT(*) as cnt, MAX(date) as latest
            FROM wip
            WHERE date < @currentWeekStart
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
  const invokedBy = req.user?.fullName || req.user?.initials || req.body?.invokedBy || req.query.invokedBy || null;
  try {
    const result = await syncCollectedTime({ daysBack, startDate, endDate, dryRun, mode, triggeredBy: 'manual', invokedBy });
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
  const invokedBy = req.user?.fullName || req.user?.initials || req.body?.invokedBy || req.query.invokedBy || null;
  try {
    const result = await syncWip({ daysBack, startDate, endDate, triggeredBy: 'manual', invokedBy });
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
  const { operation, startDate, endDate, deep, invokedBy } = req.query;
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
        // Use LIKE to match custom operation keys (e.g. syncCollectedTimeCustom_2026-01-31)
        const opBase = operation.replace(/Custom_.*$/, '');
        const logRes = await logPool.request()
        .input('op', opBase + '%')
        .input('status', 'completed')
        .query(`
            SELECT TOP 1 * FROM dataOpsLog 
            WHERE operation LIKE @op AND status = @status 
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
                    ;WITH deduped AS (
                      SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                        ORDER BY (SELECT NULL)
                      ) AS rn
                      FROM collectedTime
                      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
                    )
                    SELECT 
                        COUNT(*) as total,
                        COUNT(DISTINCT id) as unique_ids,
                        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total_sum
                    FROM deduped
                    WHERE rn = 1
                `);
            totalRows = countRes.recordset[0].total;
            uniqueIds = countRes.recordset[0].unique_ids;
            sqlCount = uniqueIds;
            sqlSum = parseFloat(countRes.recordset[0].total_sum) || 0;

            // Kind breakdown (Service vs Expense)
            const kindRes = await pool.request()
                .input('start', startDate)
                .input('end', endDate)
                .query(`
                    ;WITH deduped AS (
                      SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                        ORDER BY (SELECT NULL)
                      ) AS rn
                      FROM collectedTime
                      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
                    )
                    SELECT 
                        ISNULL(kind, 'Unknown') as kind,
                        COUNT(*) as rows,
                        COUNT(DISTINCT id) as payments,
                        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total
                    FROM deduped
                    WHERE rn = 1
                    GROUP BY kind
                    ORDER BY total DESC
                `);
            var kindBreakdown = kindRes.recordset.map(r => ({
                kind: r.kind,
                rows: r.rows,
                payments: r.payments,
                total: parseFloat(r.total) || 0,
            }));

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
            // WIP: deduped counts + sums + type breakdown
            const countRes = await pool.request()
                .input('start', startDate)
                .input('end', endDate)
                .query(`
                    ;WITH deduped AS (
                      SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY id
                        ORDER BY (SELECT NULL)
                      ) AS rn
                      FROM wip
                      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
                    )
                    SELECT
                        COUNT(*) as total,
                        COUNT(DISTINCT id) as unique_ids,
                        ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total_sum,
                        ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as total_hours
                    FROM deduped
                    WHERE rn = 1
                `);
            totalRows = countRes.recordset[0].total;
            uniqueIds = countRes.recordset[0].unique_ids;
            sqlCount = uniqueIds;
            sqlSum = parseFloat(countRes.recordset[0].total_sum) || 0;
            var wipHours = parseFloat(countRes.recordset[0].total_hours) || 0;

            // Type breakdown (TimeEntry vs ExpenseEntry)
            const typeRes = await pool.request()
                .input('start', startDate)
                .input('end', endDate)
                .query(`
                    ;WITH deduped AS (
                      SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY id
                        ORDER BY (SELECT NULL)
                      ) AS rn
                      FROM wip
                      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
                    )
                    SELECT
                        ISNULL(type, 'Unknown') as kind,
                        COUNT(*) as rows,
                        COUNT(DISTINCT id) as payments,
                        ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total,
                        ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as hours
                    FROM deduped
                    WHERE rn = 1
                    GROUP BY type
                    ORDER BY total DESC
                `);
            var kindBreakdown = typeRes.recordset.map(r => ({
                kind: r.kind,
                rows: r.rows,
                payments: r.payments,
                total: parseFloat(r.total) || 0,
                hours: parseFloat(r.hours) || 0,
            }));

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
                            ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total,
                            ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as hours
                        FROM wip
                        WHERE user_id = @uid AND ${dateCol} >= @start AND ${dateCol} <= @end
                    `);
                spotChecks.push({
                    name: u.name,
                    userId: u.userId,
                    rows: scRes.recordset[0].rows,
                    total: parseFloat(scRes.recordset[0].total) || 0,
                });
            }
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

    // 4. Log deep validation to ops log
    if (isDeep) {
      const sumMatch = (clioSum !== null && sqlSum !== null) ? Math.abs(sqlSum - clioSum) < 0.01 : false;
      const rowMatch = (clioCount !== null) && (totalRows === clioCount);
      const passed = sumMatch && rowMatch;
      const msg = clioCount !== null
        ? `${totalRows} rows · ${fmtMoneyBE(sqlSum)} SQL vs ${fmtMoneyBE(clioSum)} Clio${passed ? ' ✓' : ''}`
        : 'Clio data unavailable';
      logToSql({
        operation: operation + '_validate',
        status: passed ? 'validated' : 'completed',
        message: msg,
        startDate,
        endDate,
        triggeredBy: 'manual',
        invokedBy: invokedBy || null,
      });
    }

    // 5. Return report
    res.json({
        lastRun,
        sqlCount,
        clioCount,
        totalRows,
        uniqueIds,
        sqlSum,
        clioSum,
        spotChecks,
        kindBreakdown: kindBreakdown || [],
        hours: typeof wipHours !== 'undefined' ? wipHours : undefined,
        dataSource: table === 'wip' ? 'api' : 'reports',
        match: (clioCount !== null) && (totalRows === clioCount),
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
 * GET /api/data-operations/month-audit
 * Returns last 24 months with their most recent sync/validate entries per operation.
 * Query params: operation (collectedTime | wip)
 * Operation names in DB follow patterns like: syncCollectedTimeCustom_2026-01-01, syncWipRolling7d, *_validate
 */
router.get('/month-audit', async (req, res) => {
  const { operation } = req.query;
  if (!operation) return res.status(400).json({ error: 'operation required' });

  // Map frontend operation names to DB LIKE patterns
  const syncLike = operation === 'collectedTime' ? 'syncCollectedTime%' : 'syncWip%';
  const valLike = operation === 'collectedTime' ? 'syncCollectedTime%_validate' : 'syncWip%_validate';

  try {
    const logPool = await getLogPool();
    if (!logPool) return res.json({ months: [] });

    // Get all sync/validate entries (including started, so coverage shows attempted months)
    const result = await logPool.request()
      .input('syncLike', syncLike)
      .input('valLike', valLike)
      .query(`
        SELECT operation, status, message, startDate, endDate,
               insertedRows, deletedRows, durationMs, triggeredBy, invokedBy, ts
        FROM dataOpsLog
        WHERE operation LIKE @syncLike
          AND status IN ('completed', 'validated', 'error', 'started')
          AND ts >= DATEADD(MONTH, -24, GETUTCDATE())
        ORDER BY ts DESC
      `);

    // Build 24-month grid
    const now = new Date();
    const months = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

      const entries = (result.recordset || []).filter(r => {
        if (!r.startDate || !r.endDate) return false;
        const s = new Date(r.startDate);
        const e = new Date(r.endDate);
        return s <= monthEnd && e >= monthStart;
      });

      const syncs = entries.filter(r => !r.operation.endsWith('_validate'));
      const validates = entries.filter(r => r.operation.endsWith('_validate'));

      // Prefer completed/validated/error over started
      const lastSync = syncs.find(r => r.status !== 'started') || (syncs.length > 0 ? syncs[0] : null);
      const lastValidate = validates.length > 0 ? validates[0] : null;

      months.push({
        key,
        label,
        lastSync: lastSync ? {
          ts: lastSync.ts,
          status: lastSync.status,
          insertedRows: lastSync.insertedRows,
          deletedRows: lastSync.deletedRows,
          durationMs: lastSync.durationMs,
          invokedBy: lastSync.invokedBy,
          message: lastSync.message,
        } : null,
        lastValidate: lastValidate ? {
          ts: lastValidate.ts,
          status: lastValidate.status,
          message: lastValidate.message,
          invokedBy: lastValidate.invokedBy,
        } : null,
        syncCount: syncs.length,
        validateCount: validates.length,
      });
    }

    // For WIP: enrich months with billable/non-billable row counts from the wip table
    if (operation === 'wip') {
      try {
        const connStr = process.env.SQL_CONNECTION_STRING;
        if (connStr) {
          const dataPool = await getPool(connStr);
          const statsResult = await dataPool.request().query(`
            SELECT
              FORMAT(CAST(date AS DATE), 'yyyy-MM') AS month,
              COUNT(*) AS totalRows,
              SUM(CASE WHEN non_billable = 0 THEN 1 ELSE 0 END) AS billableRows,
              SUM(CASE WHEN non_billable = 1 THEN 1 ELSE 0 END) AS nonBillableRows,
              ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) AS totalValue,
              ISNULL(SUM(CASE WHEN non_billable = 0 THEN CAST(total AS DECIMAL(18,2)) ELSE 0 END), 0) AS billableValue,
              ISNULL(SUM(CASE WHEN non_billable = 1 THEN CAST(total AS DECIMAL(18,2)) ELSE 0 END), 0) AS nonBillableValue
            FROM wip
            WHERE date >= DATEADD(MONTH, -24, GETDATE())
            GROUP BY FORMAT(CAST(date AS DATE), 'yyyy-MM')
          `);
          const statsMap = {};
          for (const r of statsResult.recordset) {
            statsMap[r.month] = {
              totalRows: r.totalRows,
              billableRows: r.billableRows,
              nonBillableRows: r.nonBillableRows,
              totalValue: parseFloat(r.totalValue) || 0,
              billableValue: parseFloat(r.billableValue) || 0,
              nonBillableValue: parseFloat(r.nonBillableValue) || 0,
            };
          }
          // Mark current-week exclusion for the current month
          const today = new Date();
          const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          const dow = today.getDay();
          const daysSinceMonday = dow === 0 ? 6 : dow - 1;
          const lastSunday = new Date(today);
          lastSunday.setDate(today.getDate() - daysSinceMonday - 1);

          for (const m of months) {
            m.stats = statsMap[m.key] || null;
            m.currentWeekExcluded = m.key === currentMonthKey && lastSunday.getMonth() === today.getMonth();
          }
        }
      } catch (statsErr) {
        opsLogger.op('month-audit:stats:error', { error: statsErr.message });
      }
    }

    // For Collected: enrich months with row counts + total value from collectedTime table
    if (operation === 'collectedTime') {
      try {
        const connStr = process.env.SQL_CONNECTION_STRING;
        if (connStr) {
          const dataPool = await getPool(connStr);
          const statsResult = await dataPool.request().query(`
            ;WITH deduped AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
                ORDER BY (SELECT NULL)
              ) AS rn
              FROM collectedTime
              WHERE payment_date >= DATEADD(MONTH, -24, GETDATE())
            )
            SELECT
              FORMAT(CAST(payment_date AS DATE), 'yyyy-MM') AS month,
              COUNT(*) AS totalRows,
              ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) AS totalValue
            FROM deduped
            WHERE rn = 1
            GROUP BY FORMAT(CAST(payment_date AS DATE), 'yyyy-MM')
          `);
          const statsMap = {};
          for (const r of statsResult.recordset) {
            statsMap[r.month] = {
              totalRows: r.totalRows,
              billableRows: r.totalRows,
              nonBillableRows: 0,
              totalValue: parseFloat(r.totalValue) || 0,
              billableValue: parseFloat(r.totalValue) || 0,
              nonBillableValue: 0,
            };
          }
          for (const m of months) {
            m.stats = statsMap[m.key] || null;
          }
        }
      } catch (statsErr) {
        opsLogger.op('month-audit:collected-stats:error', { error: statsErr.message });
      }
    }

    res.json({ months });
  } catch (err) {
    console.error('[MonthAudit] failed:', err.message);
    res.status(500).json({ error: err.message });
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
      // Filter by operation pattern, exclude progress noise
      result = await logPool.request()
        .input('op', operation + '%')
        .input('limit', limit)
        .query(`SELECT TOP (@limit) * FROM dataOpsLog WHERE operation LIKE @op AND status NOT IN ('progress') ORDER BY ts DESC`);
    } else {
      result = await logPool.request()
        .input('limit', limit)
        .query(`SELECT TOP (@limit) * FROM dataOpsLog WHERE status NOT IN ('progress') ORDER BY ts DESC`);
    }

    res.json({ entries: result.recordset || [] });
  } catch (err) {
    console.error('[OpsLog] fetch failed', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data-operations/drift
 * Compares SQL row count against Clio source count for a date range.
 * For collectedTime: counts line items from Clio Reports API vs SQL rows.
 * For WIP: counts activities from Clio Activities API vs SQL rows.
 * Query params: operation (collectedTime|wip), startDate, endDate
 */
router.get('/drift', async (req, res) => {
  const { operation, startDate, endDate } = req.query;

  if (!operation || !startDate || !endDate) {
    return res.status(400).json({ error: 'operation, startDate, endDate required' });
  }

  const table = operation === 'collectedTime' ? 'collectedTime' : operation === 'wip' ? 'wip' : null;
  if (!table) return res.status(400).json({ error: 'operation must be collectedTime or wip' });

  const dateCol = table === 'collectedTime' ? 'payment_date' : 'date';

  try {
    // 1. Count SQL rows
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    const sqlResult = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${dateCol} >= @start AND ${dateCol} <= @end`);
    const sqlCount = sqlResult.recordset[0]?.cnt || 0;

    // 2. Count Clio source rows
    let clioCount = 0;
    let accessToken = await getClioAccessToken();

    if (table === 'wip') {
      // WIP: paginate activities API and count
      let offset = 0;
      const limit = 200;
      const startApi = new Date(startDate);
      startApi.setHours(0, 0, 0, 0);
      const endApi = new Date(endDate);
      endApi.setHours(23, 59, 59, 999);

      while (true) {
        const url = new URL('https://eu.app.clio.com/api/v4/activities.json');
        url.searchParams.set('fields', 'id');
        url.searchParams.set('start_date', startApi.toISOString());
        url.searchParams.set('end_date', endApi.toISOString());
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));

        let fetchRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (fetchRes.status === 401) {
          accessToken = await getClioAccessToken(true);
          fetchRes = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
        if (!fetchRes.ok) throw new Error(`Clio activities fetch failed: ${fetchRes.status}`);

        const data = await fetchRes.json();
        const batch = data.data || [];
        clioCount += batch.length;
        if (batch.length < limit || !data.meta?.paging?.next) break;
        offset += limit;
      }
    } else {
      // Collected: use reports API, count line items
      const startApi = new Date(startDate);
      startApi.setHours(0, 0, 0, 0);
      const endApi = new Date(endDate);
      endApi.setHours(23, 59, 59, 999);

      let reportRes = await fetch('https://eu.app.clio.com/api/v4/reports.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            start_date: startApi.toISOString(),
            end_date: endApi.toISOString(),
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
            data: {
              start_date: startApi.toISOString(),
              end_date: endApi.toISOString(),
              format: 'json',
              kind: 'invoice_payments_v2',
            },
          }),
        });
      }

      if (reportRes.ok) {
        const reportData = await reportRes.json();
        const reportId = reportData.data?.id;

        if (reportId) {
          // Poll for report completion
          let downloadData = null;
          for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
            let pollRes = await fetch(`https://eu.app.clio.com/api/v4/reports/${reportId}.json?fields=state,download_url`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (pollRes.status === 401) {
              accessToken = await getClioAccessToken(true);
              pollRes = await fetch(`https://eu.app.clio.com/api/v4/reports/${reportId}.json?fields=state,download_url`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
            }
            if (!pollRes.ok) continue;
            const pollData = await pollRes.json();
            if (pollData.data?.state === 'completed' && pollData.data?.download_url) {
              const dlRes = await fetch(pollData.data.download_url, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (dlRes.ok) downloadData = await dlRes.json();
              break;
            }
            if (pollData.data?.state === 'errored') break;
          }

          if (downloadData?.report_data) {
            for (const [, matterData] of Object.entries(downloadData.report_data)) {
              if (!matterData.bill_data || !matterData.matter_payment_data || !matterData.line_items_data) continue;
              clioCount += (matterData.line_items_data.line_items || []).length;
            }
          }
        }
      }
    }

    const drift = clioCount - sqlCount;
    res.json({
      operation,
      startDate,
      endDate,
      sqlCount,
      clioCount,
      drift,
      status: drift === 0 ? 'match' : drift > 0 ? 'missing' : 'extra',
      message: drift === 0
        ? 'Counts match — no drift detected'
        : drift > 0
          ? `${drift} rows in Clio not in SQL`
          : `${Math.abs(drift)} extra rows in SQL vs Clio`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/team-breakdown
 * Returns per-user aggregate for the selected operation and date range.
 * Query params: operation (collectedTime|wip), startDate, endDate
 */
router.get('/team-breakdown', async (req, res) => {
  const { operation, startDate, endDate } = req.query;

  if (!operation || !startDate || !endDate) {
    return res.status(400).json({ error: 'operation, startDate, endDate required' });
  }

  try {
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    if (operation === 'collectedTime') {
      const result = await pool.request()
        .input('start', startDate)
        .input('end', endDate)
        .query(`
          SELECT
            user_name,
            COUNT(*) as rows,
            ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total
          FROM collectedTime
          WHERE payment_date >= @start AND payment_date <= @end
          GROUP BY user_name
          ORDER BY total DESC
        `);
      res.json({
        operation,
        startDate,
        endDate,
        metric: 'payment_allocated',
        members: result.recordset.map((r) => ({
          name: r.user_name || 'Unknown',
          rows: r.rows,
          total: parseFloat(r.total) || 0,
        })),
      });
    } else if (operation === 'wip') {
      const result = await pool.request()
        .input('start', startDate)
        .input('end', endDate)
        .query(`
          SELECT
            user_id,
            COUNT(*) as rows,
            ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as total_hours,
            ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total_value
          FROM wip
          WHERE date >= @start AND date <= @end
          GROUP BY user_id
          ORDER BY total_value DESC
        `);
      res.json({
        operation,
        startDate,
        endDate,
        metric: 'total',
        members: result.recordset.map((r) => ({
          name: r.user_id ? `User ${r.user_id}` : 'Unknown',
          userId: r.user_id,
          rows: r.rows,
          hours: parseFloat(r.total_hours) || 0,
          total: parseFloat(r.total_value) || 0,
        })),
      });
    } else {
      res.status(400).json({ error: 'operation must be collectedTime or wip' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/monthly-totals
 * Returns monthly aggregates for an operation over the last 12 months.
 * Query params: operation (collectedTime|wip)
 */
router.get('/monthly-totals', async (req, res) => {
  const { operation } = req.query;

  if (!operation) return res.status(400).json({ error: 'operation required' });

  try {
    const connStr = process.env.SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(connStr);

    if (operation === 'collectedTime') {
      const result = await pool.request().query(`
        ;WITH deduped AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY id, user_id, kind, payment_allocated, date, payment_date
            ORDER BY (SELECT NULL)
          ) AS rn
          FROM collectedTime
          WHERE payment_date >= DATEADD(MONTH, -12, GETDATE())
        )
        SELECT
          FORMAT(CAST(payment_date AS DATE), 'yyyy-MM') as month,
          ISNULL(kind, 'Unknown') as kind,
          COUNT(*) as rows,
          ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total
        FROM deduped
        WHERE rn = 1
        GROUP BY FORMAT(CAST(payment_date AS DATE), 'yyyy-MM'), kind
        ORDER BY month DESC, total DESC
      `);
      // Aggregate per month with kind breakdown
      const monthMap = {};
      for (const r of result.recordset) {
        if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, rows: 0, total: 0, breakdown: [] };
        const val = parseFloat(r.total) || 0;
        monthMap[r.month].rows += r.rows;
        monthMap[r.month].total += val;
        monthMap[r.month].breakdown.push({ kind: r.kind, rows: r.rows, total: val });
      }
      res.json({
        operation,
        months: Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month)),
      });
    } else if (operation === 'wip') {
      const result = await pool.request().query(`
        SELECT
          FORMAT(CAST(date AS DATE), 'yyyy-MM') as month,
          ISNULL(type, 'Unknown') as type,
          COUNT(*) as rows,
          ISNULL(SUM(CAST(quantity_in_hours AS DECIMAL(18,2))), 0) as total_hours,
          ISNULL(SUM(CAST(total AS DECIMAL(18,2))), 0) as total_value
        FROM wip
        WHERE date >= DATEADD(MONTH, -12, GETDATE())
        GROUP BY FORMAT(CAST(date AS DATE), 'yyyy-MM'), type
        ORDER BY month DESC, total_value DESC
      `);
      // Aggregate per month with type breakdown
      const monthMap = {};
      for (const r of result.recordset) {
        if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, rows: 0, hours: 0, total: 0, breakdown: [] };
        const val = parseFloat(r.total_value) || 0;
        const hrs = parseFloat(r.total_hours) || 0;
        monthMap[r.month].rows += r.rows;
        monthMap[r.month].hours += hrs;
        monthMap[r.month].total += val;
        monthMap[r.month].breakdown.push({ kind: r.type, rows: r.rows, hours: hrs, total: val });
      }
      res.json({
        operation,
        months: Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month)),
      });
    } else {
      res.status(400).json({ error: 'operation must be collectedTime or wip' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data-operations/scheduler-status
 * Returns recent scheduler tier activity from the ops log.
 */
router.get('/scheduler-status', (req, res) => {
  const tiers = ['Hot', 'Warm', 'Cold'];
  const ops = ['Collected', 'Wip'];

  const status = {};
  for (const op of ops) {
    status[op.toLowerCase()] = {};
    for (const tier of tiers) {
      const prefix = op === 'Collected' ? `syncCollectedTime${tier}` : `syncWip${tier}`;
      const last = [...operationLog]
        .filter((o) => o.operation === prefix && (o.status === 'completed' || o.status === 'error'))
        .sort((a, b) => b.ts - a.ts)[0] || null;
      const nextLabel = tier === 'Hot' ? ':03/:08 (1h)' : tier === 'Warm' ? '00/06/12/18 (6h)' : '23:03/23:08 (nightly)';
      status[op.toLowerCase()][tier.toLowerCase()] = {
        lastRun: last ? { ts: last.ts, status: last.status, message: last.message } : null,
        schedule: nextLabel,
      };
    }
  }

  res.json({ enabled: true, tiers: status });
});

/**
 * GET /api/data-operations/explain
 * Returns a full transparency breakdown: the exact queries, row distributions,
 * duplicate analysis, per-user totals, and pipeline description.
 * Query params: operation, startDate, endDate
 */
router.get('/explain', async (req, res) => {
  const { operation, startDate, endDate } = req.query;
  const table = operation?.includes('Collected') ? 'collectedTime' :
                operation?.includes('Wip') ? 'wip' : null;

  if (!table || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing operation, startDate, or endDate' });
  }

  try {
    const coreConnStr = process.env.SQL_CONNECTION_STRING;
    if (!coreConnStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(coreConnStr);
    const dateCol = table === 'collectedTime' ? 'payment_date' : 'date';

    // 1. Summary counts
    const summaryQuery = `
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT id) as unique_ids,
        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total_sum,
        MIN(${dateCol}) as earliest,
        MAX(${dateCol}) as latest,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT matter_id) as unique_matters
      FROM ${table}
      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
    `;
    const summaryRes = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(summaryQuery);
    const summary = summaryRes.recordset[0];

    // 2. Duplicate analysis — how many ids appear N times
    const dupeDistQuery = `
      SELECT id_count, COUNT(*) as num_ids, SUM(id_count) as total_rows_in_group
      FROM (
        SELECT id, COUNT(*) as id_count
        FROM ${table}
        WHERE ${dateCol} >= @start AND ${dateCol} <= @end
        GROUP BY id
      ) sub
      GROUP BY id_count
      ORDER BY id_count
    `;
    const dupeDistRes = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(dupeDistQuery);
    const duplicateDistribution = dupeDistRes.recordset.map(r => ({
      occurrences: r.id_count,
      distinctIds: r.num_ids,
      totalRows: r.total_rows_in_group,
    }));

    // 3. Top multi-row IDs (ids that appear more than once) with amounts
    const topDupesQuery = `
      SELECT TOP 10 id, COUNT(*) as row_count,
        SUM(CAST(payment_allocated AS DECIMAL(18,2))) as total_amount,
        MIN(user_name) as user_name,
        MIN(CAST(description AS VARCHAR(200))) as matter_desc
      FROM ${table}
      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
      GROUP BY id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    const topDupesRes = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(topDupesQuery);
    const topMultiRowIds = topDupesRes.recordset.map(r => ({
      id: r.id,
      rowCount: r.row_count,
      totalAmount: parseFloat(r.total_amount) || 0,
      userName: r.user_name || '—',
      matterDesc: (r.matter_desc || '—').substring(0, 60),
    }));

    // 4. Per-user breakdown
    const perUserQuery = `
      SELECT
        user_name,
        user_id,
        COUNT(*) as total_rows,
        COUNT(DISTINCT id) as unique_ids,
        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as total_sum
      FROM ${table}
      WHERE ${dateCol} >= @start AND ${dateCol} <= @end
      GROUP BY user_name, user_id
      ORDER BY total_sum DESC
    `;
    const perUserRes = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(perUserQuery);
    const perUser = perUserRes.recordset.map(r => ({
      name: r.user_name || `User ${r.user_id}`,
      userId: r.user_id,
      totalRows: r.total_rows,
      uniqueIds: r.unique_ids,
      extraRows: r.total_rows - r.unique_ids,
      sum: parseFloat(r.total_sum) || 0,
    }));

    // 5. SUM with vs without DISTINCT
    const sumCompareQuery = `
      SELECT
        ISNULL(SUM(CAST(payment_allocated AS DECIMAL(18,2))), 0) as sum_all_rows
      FROM ${table}
      WHERE ${dateCol} >= @start AND ${dateCol} <= @end;

      SELECT ISNULL(SUM(sub.pa), 0) as sum_distinct_ids
      FROM (
        SELECT id, MIN(CAST(payment_allocated AS DECIMAL(18,2))) as pa
        FROM ${table}
        WHERE ${dateCol} >= @start AND ${dateCol} <= @end
        GROUP BY id
      ) sub
    `;
    const sumCompareRes = await pool.request()
      .input('start', startDate)
      .input('end', endDate)
      .query(sumCompareQuery);
    const sumAllRows = parseFloat(sumCompareRes.recordsets[0]?.[0]?.sum_all_rows) || 0;
    const sumDistinctIds = parseFloat(sumCompareRes.recordsets[1]?.[0]?.sum_distinct_ids) || 0;

    // 6. The queries themselves (for transparency)
    const queries = [
      {
        label: 'Summary',
        sql: `SELECT COUNT(*) total_rows, COUNT(DISTINCT id) unique_ids, SUM(CAST(payment_allocated AS DECIMAL(18,2))) total_sum FROM ${table} WHERE ${dateCol} >= '${startDate.slice(0,10)}' AND ${dateCol} <= '${endDate.slice(0,10)}'`,
      },
      {
        label: 'Duplicate distribution',
        sql: `SELECT id_count, COUNT(*) num_ids FROM (SELECT id, COUNT(*) id_count FROM ${table} WHERE ${dateCol} >= '...' AND ${dateCol} <= '...' GROUP BY id) sub GROUP BY id_count ORDER BY id_count`,
      },
      {
        label: 'Per-user breakdown',
        sql: `SELECT user_name, COUNT(*) total_rows, COUNT(DISTINCT id) unique_ids, SUM(payment_allocated) total_sum FROM ${table} WHERE ${dateCol} BETWEEN '...' AND '...' GROUP BY user_name, user_id ORDER BY total_sum DESC`,
      },
    ];

    // 7. Pipeline description
    const pipeline = [
      { step: 1, label: 'Request report', detail: `Clio Reports API · ${startDate.slice(0,10)} → ${endDate.slice(0,10)}` },
      { step: 2, label: 'Download', detail: 'Poll until ready, download JSON' },
      { step: 3, label: 'Clear range', detail: `DELETE FROM ${table} WHERE ${dateCol} BETWEEN @start AND @end` },
      { step: 4, label: 'Insert', detail: 'One row per line item per matter' },
      { step: 5, label: 'Validate', detail: 'COUNT / DISTINCT / SUM vs Clio totals' },
    ];

    res.json({
      operation,
      table,
      dateRange: { start: startDate, end: endDate, dateColumn: dateCol },
      summary: {
        totalRows: summary.total_rows,
        uniqueIds: summary.unique_ids,
        extraRows: summary.total_rows - summary.unique_ids,
        totalSum: parseFloat(summary.total_sum) || 0,
        earliest: summary.earliest,
        latest: summary.latest,
        uniqueUsers: summary.unique_users,
        uniqueMatters: summary.unique_matters,
      },
      sumComparison: {
        sumAllRows,
        sumDistinctIds,
        difference: parseFloat((sumAllRows - sumDistinctIds).toFixed(2)),
        warning: Math.abs(sumAllRows - sumDistinctIds) > 0.01,
        warningNote: Math.abs(sumAllRows - sumDistinctIds) > 0.01
          ? 'Split allocations — not duplicates.'
          : null,
      },
      duplicateDistribution,
      topMultiRowIds,
      perUser,
      queries,
      pipeline,
    });
  } catch (err) {
    console.error('[Explain] failed', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data-operations/explain/sample
 * Returns the actual rows for a given Clio line-item ID so users can see
 * why the same id appears multiple times (split payments, partial allocations).
 * Query params: operation, id, startDate, endDate
 */
router.get('/explain/sample', async (req, res) => {
  const { operation, id, startDate, endDate } = req.query;
  const table = operation?.includes('Collected') ? 'collectedTime' :
                operation?.includes('Wip') ? 'wip' : null;

  if (!table || !id) {
    return res.status(400).json({ error: 'Missing operation or id' });
  }

  try {
    const coreConnStr = process.env.SQL_CONNECTION_STRING;
    if (!coreConnStr) throw new Error('SQL_CONNECTION_STRING not configured');
    const pool = await getPool(coreConnStr);
    const dateCol = table === 'collectedTime' ? 'payment_date' : 'date';

    let query = `
      SELECT id, bill_id, matter_id, user_name, user_id,
        CAST(payment_allocated AS DECIMAL(18,2)) as amount,
        ${dateCol} as payment_date,
        CAST(description AS VARCHAR(200)) as description,
        kind, type
      FROM ${table}
      WHERE id = @id
    `;
    const params = { id: parseInt(id) };

    // Optionally scope to date range
    if (startDate && endDate) {
      query += ` AND ${dateCol} >= @start AND ${dateCol} <= @end`;
    }
    query += ` ORDER BY ${dateCol}`;

    const request = pool.request().input('id', params.id);
    if (startDate && endDate) {
      request.input('start', startDate).input('end', endDate);
    }
    const result = await request.query(query);

    // Build a human-readable explanation
    const rows = result.recordset;
    const billIds = [...new Set(rows.map(r => r.bill_id))];
    const totalAmount = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    let explanation = '';
    if (rows.length === 1) {
      explanation = 'This entry appears once — no split allocation.';
    } else if (billIds.length === rows.length) {
      explanation = `Split across ${rows.length} invoices — one row per bill.`;
    } else if (billIds.length === 1) {
      // Same bill ID — check if dates/amounts differ (legitimate partial payments) vs true duplicates
      const dates = [...new Set(rows.map(r => String(r.payment_date)))];
      const amounts = [...new Set(rows.map(r => parseFloat(r.amount) || 0))];
      const allIdentical = dates.length === 1 && amounts.length === 1;

      if (allIdentical) {
        explanation = `${rows.length}× identical on bill ${billIds[0]} — possible duplicates.`;
      } else {
        explanation = `${rows.length} partial payments on bill ${billIds[0]}${dates.length > 1 ? ', different dates' : ''}${amounts.length > 1 ? ', varying amounts' : ''}.`;
      }
    } else {
      explanation = `${rows.length} rows across ${billIds.length} bills — split allocations.`;
    }

    res.json({
      id: parseInt(id),
      rowCount: rows.length,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      distinctBills: billIds.length,
      explanation,
      rows: rows.map(r => ({
        billId: r.bill_id,
        matterId: r.matter_id,
        userName: r.user_name,
        amount: parseFloat(r.amount) || 0,
        paymentDate: r.payment_date,
        description: (r.description || '').substring(0, 120),
        kind: r.kind,
        type: r.type,
      })),
    });
  } catch (err) {
    console.error('[Explain/Sample] failed', err);
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
