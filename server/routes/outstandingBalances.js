/**
 * Outstanding Client Balances Routes
 * Table-backed outstanding balances with explicit sync/reconcile control-plane actions.
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { getClioAccessToken, clearClioAccessTokenCache, CLIO_API_BASE } = require('../utils/clioAuth');
const { generateCacheKey, cacheWrapper, deleteCachePattern } = require('../utils/redisClient');
const { getPool, withRequest, sql } = require('../utils/db');
const { trackDependency, trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  attachOutstandingBalancesStream,
  broadcastOutstandingBalancesChanged,
} = require('../utils/outstanding-balances-stream');

const DATASET_KEY = 'outstandingBalances';
const CURRENT_TABLE = '[dbo].[outstanding_balances_current]';
const SYNC_STATE_TABLE = '[dbo].[reporting_dataset_sync_state]';
const OUTSTANDING_FIELDS = [
  'id',
  'contact{id,name,first_name,last_name}',
  'total_outstanding_balance',
  'last_payment_date',
  'last_shared_date',
  'newest_issued_bill_due_date',
  'pending_payments_total',
  'reminders_enabled',
  'currency{id,code,sign}',
  'associated_matter_ids',
  'outstanding_bills{id,number,issued_at,due_at,balance,state,total,paid,paid_at,pending,due,last_sent_at,shared,kind}',
].join(',');
const CACHE_TTL_SECONDS = 1800;
const DEFAULT_MATTER_SEARCH_LIMIT = 12;
const MAX_MATTER_SEARCH_LIMIT = 25;

let ensureTablesPromise = null;

function toIsoDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeParseJson(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseCurrency(currency) {
  if (!currency || typeof currency !== 'object') {
    return { id: null, code: 'GBP', sign: 'GBP' };
  }

  return {
    id: currency.id == null ? null : Number(currency.id),
    code: currency.code || 'GBP',
    sign: currency.sign || 'GBP',
  };
}

function normaliseOutstandingBill(bill) {
  if (!bill || typeof bill !== 'object') {
    return null;
  }

  return {
    id: bill.id == null ? null : Number(bill.id),
    number: bill.number || null,
    issued_at: toIsoDateOrNull(bill.issued_at),
    due_at: toIsoDateOrNull(bill.due_at),
    balance: numberOrZero(bill.balance),
    state: bill.state || null,
    total: numberOrZero(bill.total),
    paid: numberOrZero(bill.paid),
    paid_at: toIsoDateOrNull(bill.paid_at),
    pending: numberOrZero(bill.pending),
    due: numberOrZero(bill.due),
    last_sent_at: toIsoDateOrNull(bill.last_sent_at),
    shared: Boolean(bill.shared),
    kind: bill.kind || null,
  };
}

function createEmptyAgeingBuckets() {
  return {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    undated: 0,
  };
}

function getAgeingBucketKey(dueAt) {
  if (!dueAt) return 'undated';

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return 'undated';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
  if (diffDays <= 0) return 'current';
  if (diffDays <= 30) return 'days_1_30';
  if (diffDays <= 60) return 'days_31_60';
  if (diffDays <= 90) return 'days_61_90';
  return 'days_90_plus';
}

function buildRowsHash(rows) {
  const hash = crypto.createHash('sha256');
  [...rows]
    .sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0))
    .forEach((row) => {
      hash.update([
        String(row?.id || ''),
        String(numberOrZero(row?.total_outstanding_balance).toFixed(2)),
        Array.isArray(row?.associated_matter_ids) ? row.associated_matter_ids.join(',') : '',
      ].join('|'));
    });
  return hash.digest('hex');
}

function buildPublicResponse(data, meta = {}) {
  return {
    data,
    meta,
  };
}

function mapStoredBalance(record) {
  const payload = safeParseJson(record.payload_json, null);
  if (payload && typeof payload === 'object') {
    return payload;
  }

  return {
    id: record.balance_id,
    contact: {
      id: record.contact_id,
      name: record.contact_name,
    },
    total_outstanding_balance: numberOrZero(record.total_outstanding_balance),
    last_payment_date: record.last_payment_date ? new Date(record.last_payment_date).toISOString() : null,
    associated_matter_ids: safeParseJson(record.associated_matter_ids_raw, []),
  };
}

function mapSyncState(record) {
  if (!record) return null;
  return {
    datasetKey: record.dataset_key,
    sourceName: record.source_name,
    lastStatus: record.last_status,
    lastSyncStartedAt: record.last_sync_started_at ? new Date(record.last_sync_started_at).toISOString() : null,
    lastSyncCompletedAt: record.last_sync_completed_at ? new Date(record.last_sync_completed_at).toISOString() : null,
    lastRowCount: record.last_row_count == null ? null : Number(record.last_row_count),
    lastTotalValue: record.last_total_value == null ? null : numberOrZero(record.last_total_value),
    lastError: record.last_error || null,
    lastDurationMs: record.last_duration_ms == null ? null : Number(record.last_duration_ms),
    sourceHash: record.source_hash || null,
    lastReconcileAt: record.last_reconcile_at ? new Date(record.last_reconcile_at).toISOString() : null,
    lastReconcileStatus: record.last_reconcile_status || null,
    lastReconcileSummary: safeParseJson(record.last_reconcile_summary, null),
  };
}

function mapMatterSummary(record) {
  if (!record) return null;

  const matterId = Number(record.matter_id);
  return {
    matterId: Number.isFinite(matterId) ? matterId : null,
    displayNumber: record.display_number || String(record.matter_id || ''),
    clientName: record.client_name || 'Unknown client',
    responsibleSolicitor: record.responsible_solicitor || null,
    practiceArea: record.practice_area || null,
    description: record.description || null,
    status: record.close_date ? 'closed' : 'active',
    originalStatus: record.status || null,
    openDate: toIsoDateOrNull(record.open_date),
    closeDate: toIsoDateOrNull(record.close_date),
  };
}

async function fetchClioJsonWithRetry(url, label) {
  let accessToken = await getClioAccessToken();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return response.json();
    }

    const errorText = await response.text();
    console.error(`[OutstandingBalances] ${label} Clio API error:`, errorText);

    if (response.status === 401 && attempt === 0) {
      clearClioAccessTokenCache();
      accessToken = await getClioAccessToken();
      continue;
    }

    throw new Error(`Clio API error: ${response.status}`);
  }

  throw new Error(`Clio API error: retry exhausted for ${label}`);
}

async function ensureOutstandingBalancesTables() {
  if (ensureTablesPromise) {
    return ensureTablesPromise;
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING not configured');
  }

  ensureTablesPromise = withRequest(connectionString, async (request) => {
    await request.query(`
      IF OBJECT_ID('${CURRENT_TABLE}', 'U') IS NULL
      BEGIN
        CREATE TABLE ${CURRENT_TABLE} (
          balance_id BIGINT NOT NULL PRIMARY KEY,
          contact_id BIGINT NULL,
          contact_name NVARCHAR(255) NULL,
          total_outstanding_balance DECIMAL(18, 2) NOT NULL,
          last_payment_date DATETIME2 NULL,
          associated_matter_ids_raw NVARCHAR(MAX) NULL,
          payload_json NVARCHAR(MAX) NOT NULL,
          source_synced_at DATETIME2 NOT NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_outstanding_balances_current_created_at DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_outstanding_balances_current_updated_at DEFAULT SYSUTCDATETIME()
        );

        CREATE INDEX IX_outstanding_balances_current_contact_name
          ON ${CURRENT_TABLE} (contact_name);
      END;

      IF OBJECT_ID('${SYNC_STATE_TABLE}', 'U') IS NULL
      BEGIN
        CREATE TABLE ${SYNC_STATE_TABLE} (
          dataset_key NVARCHAR(120) NOT NULL PRIMARY KEY,
          source_name NVARCHAR(40) NOT NULL,
          last_status NVARCHAR(24) NULL,
          last_sync_started_at DATETIME2 NULL,
          last_sync_completed_at DATETIME2 NULL,
          last_row_count INT NULL,
          last_total_value DECIMAL(18, 2) NULL,
          last_error NVARCHAR(MAX) NULL,
          last_duration_ms INT NULL,
          source_hash NVARCHAR(64) NULL,
          last_reconcile_at DATETIME2 NULL,
          last_reconcile_status NVARCHAR(24) NULL,
          last_reconcile_summary NVARCHAR(MAX) NULL,
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_reporting_dataset_sync_state_updated_at DEFAULT SYSUTCDATETIME()
        );
      END;
    `);
  }).catch((error) => {
    ensureTablesPromise = null;
    throw error;
  });

  return ensureTablesPromise;
}

async function markSyncState(target, {
  status,
  startedAt = null,
  completedAt = null,
  rowCount = null,
  totalValue = null,
  error = null,
  durationMs = null,
  sourceHash = null,
}) {
  const request = new sql.Request(target);
  request.input('datasetKey', sql.NVarChar(120), DATASET_KEY);
  request.input('sourceName', sql.NVarChar(40), 'clio');
  request.input('status', sql.NVarChar(24), status);
  request.input('startedAt', sql.DateTime2, startedAt ? new Date(startedAt) : null);
  request.input('completedAt', sql.DateTime2, completedAt ? new Date(completedAt) : null);
  request.input('rowCount', sql.Int, rowCount == null ? null : Number(rowCount));
  request.input('totalValue', sql.Decimal(18, 2), totalValue == null ? null : Number(totalValue));
  request.input('error', sql.NVarChar(sql.MAX), error || null);
  request.input('durationMs', sql.Int, durationMs == null ? null : Number(durationMs));
  request.input('sourceHash', sql.NVarChar(64), sourceHash || null);

  await request.query(`
    MERGE ${SYNC_STATE_TABLE} AS target
    USING (SELECT @datasetKey AS dataset_key) AS source
      ON target.dataset_key = source.dataset_key
    WHEN MATCHED THEN
      UPDATE SET
        source_name = @sourceName,
        last_status = @status,
        last_sync_started_at = @startedAt,
        last_sync_completed_at = @completedAt,
        last_row_count = @rowCount,
        last_total_value = @totalValue,
        last_error = @error,
        last_duration_ms = @durationMs,
        source_hash = @sourceHash,
        updated_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        dataset_key,
        source_name,
        last_status,
        last_sync_started_at,
        last_sync_completed_at,
        last_row_count,
        last_total_value,
        last_error,
        last_duration_ms,
        source_hash,
        updated_at
      )
      VALUES (
        @datasetKey,
        @sourceName,
        @status,
        @startedAt,
        @completedAt,
        @rowCount,
        @totalValue,
        @error,
        @durationMs,
        @sourceHash,
        SYSUTCDATETIME()
      );
  `);
}

async function markReconcileState(target, { status, checkedAt, summary }) {
  const request = new sql.Request(target);
  request.input('datasetKey', sql.NVarChar(120), DATASET_KEY);
  request.input('sourceName', sql.NVarChar(40), 'clio');
  request.input('status', sql.NVarChar(24), status);
  request.input('checkedAt', sql.DateTime2, checkedAt ? new Date(checkedAt) : null);
  request.input('summary', sql.NVarChar(sql.MAX), summary ? JSON.stringify(summary) : null);

  await request.query(`
    MERGE ${SYNC_STATE_TABLE} AS target
    USING (SELECT @datasetKey AS dataset_key) AS source
      ON target.dataset_key = source.dataset_key
    WHEN MATCHED THEN
      UPDATE SET
        source_name = @sourceName,
        last_reconcile_at = @checkedAt,
        last_reconcile_status = @status,
        last_reconcile_summary = @summary,
        updated_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        dataset_key,
        source_name,
        last_reconcile_at,
        last_reconcile_status,
        last_reconcile_summary,
        updated_at
      )
      VALUES (
        @datasetKey,
        @sourceName,
        @checkedAt,
        @status,
        @summary,
        SYSUTCDATETIME()
      );
  `);
}

async function invalidateOutstandingBalanceCaches() {
  await Promise.all([
    deleteCachePattern('metrics:outstanding-balances-v2*'),
    deleteCachePattern('metrics:outstanding-balances-user*'),
    deleteCachePattern('home:outstandingbalances*'),
  ]);
}

async function fetchLiveOutstandingBalances() {
  const startedAt = Date.now();
  const balancesUrl = `${CLIO_API_BASE}/outstanding_client_balances.json?fields=${encodeURIComponent(OUTSTANDING_FIELDS)}`;

  try {
    const data = await fetchClioJsonWithRetry(balancesUrl, 'balances');
    const rows = Array.isArray(data?.data) ? data.data : [];
    const durationMs = Date.now() - startedAt;
    trackDependency('Clio', 'GET /outstanding_client_balances.json', durationMs, true, {
      dataset: DATASET_KEY,
      rowCount: rows.length,
    });
    trackMetric('Reporting.OutstandingBalances.LiveFetchDuration', durationMs, {
      dataset: DATASET_KEY,
    });
    return rows;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackDependency('Clio', 'GET /outstanding_client_balances.json', durationMs, false, {
      dataset: DATASET_KEY,
    });
    trackException(error, {
      operation: 'Reporting.OutstandingBalances.LiveFetch',
      dataset: DATASET_KEY,
    });
    throw error;
  }
}

function normaliseLiveBalance(balance, syncedAtIso) {
  const associatedMatterIds = Array.isArray(balance?.associated_matter_ids)
    ? balance.associated_matter_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const outstandingBills = Array.isArray(balance?.outstanding_bills)
    ? balance.outstanding_bills.map(normaliseOutstandingBill).filter(Boolean)
    : [];
  const payload = {
    ...balance,
    total_outstanding_balance: numberOrZero(balance?.total_outstanding_balance),
    associated_matter_ids: associatedMatterIds,
    last_payment_date: toIsoDateOrNull(balance?.last_payment_date),
    last_shared_date: toIsoDateOrNull(balance?.last_shared_date),
    newest_issued_bill_due_date: toIsoDateOrNull(balance?.newest_issued_bill_due_date),
    pending_payments_total: numberOrZero(balance?.pending_payments_total),
    reminders_enabled: Boolean(balance?.reminders_enabled),
    currency: normaliseCurrency(balance?.currency),
    outstanding_bills: outstandingBills,
  };

  return {
    balanceId: Number(balance?.id),
    contactId: balance?.contact?.id == null ? null : Number(balance.contact.id),
    contactName: balance?.contact?.name || null,
    totalOutstandingBalance: numberOrZero(balance?.total_outstanding_balance),
    lastPaymentDate: toIsoDateOrNull(balance?.last_payment_date),
    associatedMatterIdsRaw: JSON.stringify(associatedMatterIds),
    payloadJson: JSON.stringify(payload),
    sourceSyncedAt: syncedAtIso,
  };
}

async function readStoredOutstandingBalances({ warmSync = false } = {}) {
  await ensureOutstandingBalancesTables();
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const pool = await getPool(connectionString);

  const statePromise = (() => {
    const request = pool.request();
    request.input('datasetKey', sql.NVarChar(120), DATASET_KEY);
    return request.query(`
      SELECT TOP 1 *
      FROM ${SYNC_STATE_TABLE}
      WHERE dataset_key = @datasetKey
    `);
  })();

  const rowsPromise = pool.request().query(`
    SELECT
      balance_id,
      contact_id,
      contact_name,
      total_outstanding_balance,
      last_payment_date,
      associated_matter_ids_raw,
      payload_json,
      source_synced_at
    FROM ${CURRENT_TABLE}
    ORDER BY total_outstanding_balance DESC, contact_name ASC
  `);

  const [stateResult, rowsResult] = await Promise.all([statePromise, rowsPromise]);
  const rows = Array.isArray(rowsResult.recordset)
    ? rowsResult.recordset.map(mapStoredBalance)
    : [];
  const state = mapSyncState(stateResult.recordset?.[0]);

  if (rows.length === 0 && warmSync) {
    await syncOutstandingBalancesCurrent({ invokedBy: 'system', trigger: 'read-through' });
    return readStoredOutstandingBalances({ warmSync: false });
  }

  return {
    rows,
    state,
    source: rows.length > 0 ? 'table' : 'empty',
  };
}

async function getOutstandingBalancesStatus() {
  await ensureOutstandingBalancesTables();
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const pool = await getPool(connectionString);

  const summaryPromise = pool.request().query(`
    SELECT
      COUNT(*) AS row_count,
      CAST(COALESCE(SUM(total_outstanding_balance), 0) AS DECIMAL(18, 2)) AS total_balance,
      MAX(source_synced_at) AS latest_source_synced_at
    FROM ${CURRENT_TABLE}
  `);
  const statePromise = (() => {
    const request = pool.request();
    request.input('datasetKey', sql.NVarChar(120), DATASET_KEY);
    return request.query(`
      SELECT TOP 1 *
      FROM ${SYNC_STATE_TABLE}
      WHERE dataset_key = @datasetKey
    `);
  })();

  const [summaryResult, stateResult] = await Promise.all([summaryPromise, statePromise]);
  const summary = summaryResult.recordset?.[0] || {};
  const state = mapSyncState(stateResult.recordset?.[0]);
  const latestSourceSyncedAt = summary.latest_source_synced_at
    ? new Date(summary.latest_source_synced_at).toISOString()
    : null;
  const freshnessMinutes = latestSourceSyncedAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(latestSourceSyncedAt)) / 60000))
    : null;

  return {
    datasetKey: DATASET_KEY,
    rowCount: Number(summary.row_count || 0),
    totalBalance: numberOrZero(summary.total_balance),
    latestSourceSyncedAt,
    freshnessMinutes,
    isStale: freshnessMinutes == null ? true : freshnessMinutes > 30,
    lastSync: state
      ? {
          status: state.lastStatus,
          startedAt: state.lastSyncStartedAt,
          completedAt: state.lastSyncCompletedAt,
          rowCount: state.lastRowCount,
          totalBalance: state.lastTotalValue,
          durationMs: state.lastDurationMs,
          error: state.lastError,
          sourceHash: state.sourceHash,
        }
      : null,
    lastReconcile: state
      ? {
          checkedAt: state.lastReconcileAt,
          status: state.lastReconcileStatus,
          summary: state.lastReconcileSummary,
        }
      : null,
  };
}

async function getOutstandingBalancesSnapshot({ forceLive = false } = {}) {
  if (forceLive) {
    const liveRows = await fetchLiveOutstandingBalances();
    return buildPublicResponse(liveRows, {
      source: 'live',
    });
  }

  try {
    const snapshot = await readStoredOutstandingBalances({ warmSync: true });
    return buildPublicResponse(snapshot.rows, {
      source: snapshot.source,
      lastSync: snapshot.state?.lastSyncCompletedAt || null,
      status: snapshot.state?.lastStatus || null,
    });
  } catch (tableError) {
    trackException(tableError, {
      operation: 'Reporting.OutstandingBalances.TableRead',
    });
    const liveRows = await fetchLiveOutstandingBalances();
    return buildPublicResponse(liveRows, {
      source: 'live-fallback',
      warning: 'table-read-failed',
    });
  }
}

async function syncOutstandingBalancesCurrent({ invokedBy = 'manual', trigger = 'manual' } = {}) {
  await ensureOutstandingBalancesTables();
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const startedAt = Date.now();
  const syncStartedAt = new Date().toISOString();
  const pool = await getPool(connectionString);

  trackEvent('Reporting.OutstandingBalances.Started', {
    operation: 'sync',
    triggeredBy: trigger,
    invokedBy,
  });
  await markSyncState(pool, {
    status: 'started',
    startedAt: syncStartedAt,
  });

  let transaction = null;

  try {
    const liveRows = await fetchLiveOutstandingBalances();
    const normalisedRows = liveRows.map((row) => normaliseLiveBalance(row, syncStartedAt));
    const totalBalance = normalisedRows.reduce((sum, row) => sum + row.totalOutstandingBalance, 0);
    const sourceHash = buildRowsHash(liveRows);

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    await new sql.Request(transaction).query(`DELETE FROM ${CURRENT_TABLE}`);

    for (const row of normalisedRows) {
      const request = new sql.Request(transaction);
      request.input('balanceId', sql.BigInt, row.balanceId);
      request.input('contactId', sql.BigInt, row.contactId);
      request.input('contactName', sql.NVarChar(255), row.contactName);
      request.input('totalOutstandingBalance', sql.Decimal(18, 2), row.totalOutstandingBalance);
      request.input('lastPaymentDate', sql.DateTime2, row.lastPaymentDate ? new Date(row.lastPaymentDate) : null);
      request.input('associatedMatterIdsRaw', sql.NVarChar(sql.MAX), row.associatedMatterIdsRaw);
      request.input('payloadJson', sql.NVarChar(sql.MAX), row.payloadJson);
      request.input('sourceSyncedAt', sql.DateTime2, new Date(row.sourceSyncedAt));
      await request.query(`
        INSERT INTO ${CURRENT_TABLE} (
          balance_id,
          contact_id,
          contact_name,
          total_outstanding_balance,
          last_payment_date,
          associated_matter_ids_raw,
          payload_json,
          source_synced_at,
          updated_at
        )
        VALUES (
          @balanceId,
          @contactId,
          @contactName,
          @totalOutstandingBalance,
          @lastPaymentDate,
          @associatedMatterIdsRaw,
          @payloadJson,
          @sourceSyncedAt,
          SYSUTCDATETIME()
        )
      `);
    }

    await transaction.commit();
    transaction = null;

    const durationMs = Date.now() - startedAt;
    await markSyncState(pool, {
      status: 'completed',
      startedAt: syncStartedAt,
      completedAt: new Date().toISOString(),
      rowCount: normalisedRows.length,
      totalValue: totalBalance,
      error: null,
      durationMs,
      sourceHash,
    });
    await invalidateOutstandingBalanceCaches();

    // R7: notify connected clients so the Home tile pulses + refetches.
    try {
      broadcastOutstandingBalancesChanged({
        rowCount: normalisedRows.length,
        totalBalance,
        triggeredBy: trigger,
      });
    } catch { /* best-effort */ }

    trackEvent('Reporting.OutstandingBalances.Completed', {
      operation: 'sync',
      triggeredBy: trigger,
      invokedBy,
      rowCount: normalisedRows.length,
    });
    trackMetric('Reporting.OutstandingBalances.SyncDuration', durationMs, {
      dataset: DATASET_KEY,
    });

    return {
      rowCount: normalisedRows.length,
      totalBalance,
      sourceHash,
      durationMs,
      syncedAt: syncStartedAt,
    };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        // Ignore rollback errors; the sync state write below is the important one.
      }
    }

    const durationMs = Date.now() - startedAt;
    await markSyncState(pool, {
      status: 'error',
      startedAt: syncStartedAt,
      completedAt: new Date().toISOString(),
      error: error.message || String(error),
      durationMs,
    });
    trackException(error, {
      operation: 'Reporting.OutstandingBalances.Sync',
      triggeredBy: trigger,
      invokedBy,
    });
    trackEvent('Reporting.OutstandingBalances.Failed', {
      operation: 'sync',
      triggeredBy: trigger,
      invokedBy,
      error: error.message || String(error),
    });
    throw error;
  }
}

async function getUserMatterIds(entraId) {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING not configured');
  }

  const user = await withRequest(connectionString, async (request, sqlClient) => {
    request.input('entraId', sqlClient.NVarChar, entraId);
    const result = await request.query(`
      SELECT TOP 1
        [Full Name] AS fullName,
        [First] AS firstName,
        [Last] AS lastName,
        [Nickname] AS nickname,
        [Initials] AS initials
      FROM team
      WHERE [Entra ID] = @entraId
    `);
    return result.recordset?.[0] || null;
  });

  if (!user) {
    throw new Error('User not found');
  }

  const candidates = [
    { value: user.fullName, allowLike: true },
    { value: [user.firstName, user.lastName].filter(Boolean).join(' '), allowLike: true },
    { value: user.nickname, allowLike: true },
    { value: user.initials, allowLike: false },
  ].filter((candidate, index, all) => {
    const normalized = String(candidate.value || '').trim().toLowerCase();
    if (!normalized) return false;
    return all.findIndex((other) => String(other.value || '').trim().toLowerCase() === normalized) === index;
  });

  if (candidates.length === 0) {
    return [];
  }

  const pool = await getPool(connectionString);
  const request = pool.request();
  const predicates = [];

  candidates.forEach((candidate, index) => {
    const key = `candidate${index}`;
    const likeKey = `candidateLike${index}`;
    const normalized = String(candidate.value || '').trim().toLowerCase();
    request.input(key, sql.NVarChar(200), normalized);
    predicates.push(`LOWER(ISNULL([Responsible Solicitor], '')) = @${key}`);
    predicates.push(`LOWER(ISNULL([Originating Solicitor], '')) = @${key}`);

    if (candidate.allowLike && normalized.length > 3) {
      request.input(likeKey, sql.NVarChar(210), `%${normalized}%`);
      predicates.push(`LOWER(ISNULL([Responsible Solicitor], '')) LIKE @${likeKey}`);
      predicates.push(`LOWER(ISNULL([Originating Solicitor], '')) LIKE @${likeKey}`);
    }
  });

  const result = await request.query(`
    SELECT DISTINCT [Unique ID] AS matterId
    FROM matters
    WHERE ${predicates.join(' OR ')}
  `);

  return (result.recordset || [])
    .map((row) => Number(row.matterId))
    .filter((value) => Number.isFinite(value));
}

async function searchMatterSummaries(query, limit = DEFAULT_MATTER_SEARCH_LIMIT) {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING not configured');
  }

  const trimmedQuery = String(query || '').trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_MATTER_SEARCH_LIMIT, MAX_MATTER_SEARCH_LIMIT));
  const pool = await getPool(connectionString);
  const request = pool.request();
  request.input('limit', sql.Int, normalizedLimit);
  request.input('queryLike', sql.NVarChar(220), `%${trimmedQuery}%`);
  request.input('queryExact', sql.NVarChar(100), trimmedQuery);

  const result = await request.query(`
    SELECT TOP (@limit)
      [Unique ID] AS matter_id,
      [Display Number] AS display_number,
      [Client Name] AS client_name,
      [Responsible Solicitor] AS responsible_solicitor,
      [Practice Area] AS practice_area,
      [Description] AS description,
      [Status] AS status,
      [Open Date] AS open_date,
      [Close Date] AS close_date
    FROM matters
    WHERE [Display Number] LIKE @queryLike
      OR [Client Name] LIKE @queryLike
      OR [Responsible Solicitor] LIKE @queryLike
      OR [Description] LIKE @queryLike
      OR CONVERT(NVARCHAR(100), [Unique ID]) = @queryExact
    ORDER BY
      CASE
        WHEN [Display Number] = @queryExact THEN 0
        WHEN [Client Name] = @queryExact THEN 1
        WHEN [Responsible Solicitor] = @queryExact THEN 2
        ELSE 3
      END,
      CASE WHEN [Close Date] IS NULL THEN 0 ELSE 1 END,
      TRY_CONVERT(DATE, [Open Date]) DESC,
      [Unique ID] DESC
  `);

  return (result.recordset || []).map(mapMatterSummary).filter(Boolean);
}

async function getMatterSummariesByIds(matterIds) {
  const ids = [...new Set((matterIds || []).map((value) => Number(value)).filter((value) => Number.isFinite(value)))];
  if (ids.length === 0) {
    return new Map();
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL_CONNECTION_STRING not configured');
  }

  const pool = await getPool(connectionString);
  const request = pool.request();
  const placeholders = ids.map((id, index) => {
    const key = `matterId${index}`;
    request.input(key, sql.BigInt, id);
    return `@${key}`;
  });

  const result = await request.query(`
    SELECT
      [Unique ID] AS matter_id,
      [Display Number] AS display_number,
      [Client Name] AS client_name,
      [Responsible Solicitor] AS responsible_solicitor,
      [Practice Area] AS practice_area,
      [Description] AS description,
      [Status] AS status,
      [Open Date] AS open_date,
      [Close Date] AS close_date
    FROM matters
    WHERE [Unique ID] IN (${placeholders.join(', ')})
  `);

  return new Map((result.recordset || []).map((row) => {
    const summary = mapMatterSummary(row);
    return [summary.matterId, summary];
  }));
}

async function getMatterExposureBreakdown(matterId) {
  const numericMatterId = Number(matterId);
  if (!Number.isFinite(numericMatterId)) {
    throw new Error('Invalid matterId');
  }

  const matterMap = await getMatterSummariesByIds([numericMatterId]);
  const matter = matterMap.get(numericMatterId) || null;
  if (!matter) {
    return null;
  }

  const snapshot = await readStoredOutstandingBalances({ warmSync: true });
  const linkedBalances = snapshot.rows.filter((balance) =>
    Array.isArray(balance?.associated_matter_ids)
    && balance.associated_matter_ids.some((linkedMatterId) => Number(linkedMatterId) === numericMatterId)
  );

  const relatedMatterIds = [...new Set(
    linkedBalances.flatMap((balance) => Array.isArray(balance?.associated_matter_ids) ? balance.associated_matter_ids : [])
  )]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const relatedMatterMap = await getMatterSummariesByIds(relatedMatterIds);
  const totals = {
    linkedClientCount: 0,
    totalLinkedExposure: 0,
    exclusiveExposure: 0,
    sharedExposure: 0,
    overdueExposure: 0,
    pendingPaymentsTotal: 0,
    billCount: 0,
    overdueBillCount: 0,
    ageingBuckets: createEmptyAgeingBuckets(),
  };

  const clients = linkedBalances
    .map((balance) => {
      const linkedMatterIds = [...new Set((Array.isArray(balance?.associated_matter_ids) ? balance.associated_matter_ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)))];
      const linkedMatters = linkedMatterIds
        .map((linkedMatterId) => relatedMatterMap.get(linkedMatterId))
        .filter(Boolean)
        .map((linkedMatter) => ({
          matterId: linkedMatter.matterId,
          displayNumber: linkedMatter.displayNumber,
          clientName: linkedMatter.clientName,
        }));
      const totalOutstandingBalance = numberOrZero(balance?.total_outstanding_balance);
      const bills = Array.isArray(balance?.outstanding_bills)
        ? balance.outstanding_bills.map(normaliseOutstandingBill).filter(Boolean)
        : [];
      const clientAgeingBuckets = createEmptyAgeingBuckets();
      const normalisedBills = bills
        .map((bill) => {
          const dueAmount = numberOrZero(bill?.due || bill?.balance);
          const pendingAmount = numberOrZero(bill?.pending);
          const ageingBucket = getAgeingBucketKey(bill?.due_at);
          clientAgeingBuckets[ageingBucket] += dueAmount;

          return {
            billId: bill.id,
            billNumber: bill.number || (bill.id == null ? 'Unknown bill' : `Bill ${bill.id}`),
            issuedAt: bill.issued_at,
            dueAt: bill.due_at,
            dueAmount,
            totalAmount: numberOrZero(bill?.total),
            paidAmount: numberOrZero(bill?.paid),
            pendingAmount,
            state: bill.state,
            shared: Boolean(bill?.shared),
            kind: bill.kind || null,
            lastSentAt: bill.last_sent_at,
            paidAt: bill.paid_at,
            ageingBucket,
            isOverdue: ageingBucket !== 'current' && ageingBucket !== 'undated' && dueAmount > 0,
          };
        })
        .sort((left, right) => {
          const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
          const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
          if (leftDue !== rightDue) return leftDue - rightDue;
          return right.dueAmount - left.dueAmount;
        });
      const pendingPaymentsTotal = numberOrZero(balance?.pending_payments_total)
        || normalisedBills.reduce((sum, bill) => sum + bill.pendingAmount, 0);
      const overdueExposure = normalisedBills.reduce((sum, bill) => sum + (bill.isOverdue ? bill.dueAmount : 0), 0);
      const overdueBillCount = normalisedBills.filter((bill) => bill.isOverdue).length;

      totals.linkedClientCount += 1;
      totals.totalLinkedExposure += totalOutstandingBalance;
      totals.pendingPaymentsTotal += pendingPaymentsTotal;
      totals.overdueExposure += overdueExposure;
      totals.billCount += normalisedBills.length;
      totals.overdueBillCount += overdueBillCount;
      Object.keys(clientAgeingBuckets).forEach((bucketKey) => {
        totals.ageingBuckets[bucketKey] += clientAgeingBuckets[bucketKey];
      });
      if (linkedMatterIds.length === 1) {
        totals.exclusiveExposure += totalOutstandingBalance;
      } else {
        totals.sharedExposure += totalOutstandingBalance;
      }

      return {
        balanceId: Number(balance?.id),
        contactId: balance?.contact?.id == null ? null : Number(balance.contact.id),
        contactName: balance?.contact?.name || 'Unknown client',
        totalOutstandingBalance,
        lastPaymentDate: toIsoDateOrNull(balance?.last_payment_date),
        lastSharedDate: toIsoDateOrNull(balance?.last_shared_date),
        newestIssuedBillDueDate: toIsoDateOrNull(balance?.newest_issued_bill_due_date),
        pendingPaymentsTotal,
        remindersEnabled: Boolean(balance?.reminders_enabled),
        currency: normaliseCurrency(balance?.currency),
        matterCount: linkedMatterIds.length,
        associationType: linkedMatterIds.length === 1 ? 'exclusive' : 'shared',
        linkedMatterIds,
        linkedMatters,
        billCount: normalisedBills.length,
        overdueBillCount,
        overdueExposure,
        ageingBuckets: clientAgeingBuckets,
        bills: normalisedBills,
      };
    })
    .sort((left, right) => right.totalOutstandingBalance - left.totalOutstandingBalance);

  return {
    matter,
    source: snapshot.source,
    snapshot: {
      lastSync: snapshot.state?.lastSyncCompletedAt || null,
      status: snapshot.state?.lastStatus || null,
    },
    totals,
    clients,
  };
}

function buildReconciliation(tableRows, liveRows) {
  const tableMap = new Map(tableRows.map((row) => [Number(row.id), numberOrZero(row.total_outstanding_balance)]));
  const liveMap = new Map(liveRows.map((row) => [Number(row.id), numberOrZero(row.total_outstanding_balance)]));

  const missingIds = [];
  const extraIds = [];
  const changed = [];

  liveMap.forEach((liveTotal, id) => {
    if (!tableMap.has(id)) {
      missingIds.push(id);
      return;
    }
    const tableTotal = tableMap.get(id);
    if (Math.abs(numberOrZero(tableTotal) - liveTotal) > 0.009) {
      changed.push({ id, tableTotal: numberOrZero(tableTotal), liveTotal });
    }
  });

  tableMap.forEach((_tableTotal, id) => {
    if (!liveMap.has(id)) {
      extraIds.push(id);
    }
  });

  const tableTotal = tableRows.reduce((sum, row) => sum + numberOrZero(row.total_outstanding_balance), 0);
  const liveTotal = liveRows.reduce((sum, row) => sum + numberOrZero(row.total_outstanding_balance), 0);

  return {
    status: missingIds.length === 0 && extraIds.length === 0 && changed.length === 0 ? 'match' : 'drift',
    tableCount: tableRows.length,
    liveCount: liveRows.length,
    tableTotal,
    liveTotal,
    totalDrift: Number((tableTotal - liveTotal).toFixed(2)),
    missingCount: missingIds.length,
    extraCount: extraIds.length,
    changedCount: changed.length,
    samples: {
      missingIds: missingIds.slice(0, 10),
      extraIds: extraIds.slice(0, 10),
      changed: changed.slice(0, 10),
    },
  };
}

router.get('/status', async (_req, res) => {
  try {
    const status = await getOutstandingBalancesStatus();
    res.json(status);
  } catch (error) {
    console.error('[OutstandingBalances] Status error:', error.message || error);
    res.status(500).json({ error: error.message || 'Unable to load outstanding balances status' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const invokedBy = req.body?.invokedBy || 'manual';
    const summary = await syncOutstandingBalancesCurrent({ invokedBy, trigger: 'manual' });
    res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error('[OutstandingBalances] Sync error:', error.message || error);
    res.status(500).json({ error: error.message || 'Outstanding balances sync failed' });
  }
});

router.post('/reconcile', async (req, res) => {
  try {
    const invokedBy = req.body?.invokedBy || 'manual';
    const [{ rows: tableRows }, liveRows] = await Promise.all([
      readStoredOutstandingBalances({ warmSync: false }),
      fetchLiveOutstandingBalances(),
    ]);
    const summary = buildReconciliation(tableRows, liveRows);
    const checkedAt = new Date().toISOString();
    const pool = await getPool(process.env.SQL_CONNECTION_STRING);
    await markReconcileState(pool, {
      status: summary.status,
      checkedAt,
      summary: {
        ...summary,
        checkedAt,
      },
    });

    trackEvent('Reporting.OutstandingBalances.Reconciled', {
      operation: 'reconcile',
      invokedBy,
      status: summary.status,
      missingCount: summary.missingCount,
      extraCount: summary.extraCount,
      changedCount: summary.changedCount,
    });

    res.json({
      checkedAt,
      ...summary,
    });
  } catch (error) {
    console.error('[OutstandingBalances] Reconcile error:', error.message || error);
    trackException(error, {
      operation: 'Reporting.OutstandingBalances.Reconcile',
    });
    res.status(500).json({ error: error.message || 'Outstanding balances reconciliation failed' });
  }
});

router.get('/matter-search', async (req, res) => {
  const startedAt = Date.now();
  const query = String(req.query.q || '').trim();

  try {
    trackEvent('Reporting.OutstandingBalances.MatterSearch.Started', {
      operation: 'matter-search',
      queryLength: query.length,
    });

    const results = await searchMatterSummaries(query, req.query.limit);
    const durationMs = Date.now() - startedAt;
    trackEvent('Reporting.OutstandingBalances.MatterSearch.Completed', {
      operation: 'matter-search',
      queryLength: query.length,
      resultCount: results.length,
    });
    trackMetric('Reporting.OutstandingBalances.MatterSearchDuration', durationMs, {
      dataset: DATASET_KEY,
    });

    res.json({
      query,
      results,
    });
  } catch (error) {
    trackException(error, {
      operation: 'Reporting.OutstandingBalances.MatterSearch',
      queryLength: query.length,
    });
    trackEvent('Reporting.OutstandingBalances.MatterSearch.Failed', {
      operation: 'matter-search',
      queryLength: query.length,
      error: error.message || String(error),
    });
    console.error('[OutstandingBalances] Matter search error:', error.message || error);
    res.status(500).json({ error: error.message || 'Unable to search matters' });
  }
});

router.get('/matter/:matterId', async (req, res) => {
  const startedAt = Date.now();
  const numericMatterId = Number(req.params.matterId);

  try {
    if (!Number.isFinite(numericMatterId)) {
      return res.status(400).json({ error: 'Invalid matterId' });
    }

    trackEvent('Reporting.OutstandingBalances.MatterBreakdown.Started', {
      operation: 'matter-breakdown',
      matterId: numericMatterId,
    });

    const breakdown = await getMatterExposureBreakdown(numericMatterId);
    if (!breakdown) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const durationMs = Date.now() - startedAt;
    trackEvent('Reporting.OutstandingBalances.MatterBreakdown.Completed', {
      operation: 'matter-breakdown',
      matterId: numericMatterId,
      linkedClientCount: breakdown.totals.linkedClientCount,
    });
    trackMetric('Reporting.OutstandingBalances.MatterBreakdownDuration', durationMs, {
      dataset: DATASET_KEY,
    });

    res.json(breakdown);
  } catch (error) {
    trackException(error, {
      operation: 'Reporting.OutstandingBalances.MatterBreakdown',
      matterId: Number.isFinite(numericMatterId) ? numericMatterId : null,
    });
    trackEvent('Reporting.OutstandingBalances.MatterBreakdown.Failed', {
      operation: 'matter-breakdown',
      matterId: Number.isFinite(numericMatterId) ? numericMatterId : 'invalid',
      error: error.message || String(error),
    });
    console.error('[OutstandingBalances] Matter breakdown error:', error.message || error);
    res.status(500).json({ error: error.message || 'Unable to load matter breakdown' });
  }
});

/**
 * GET /api/outstanding-balances/user/:entraId
 * Returns outstanding balances for the user's locally-known matters.
 */
router.get('/user/:entraId', async (req, res) => {
  try {
    const { entraId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'outstanding-balances-user', entraId, today);

    const balancesData = await cacheWrapper(cacheKey, async () => {
      const startedAt = Date.now();
      const [matterIds, snapshot] = await Promise.all([
        getUserMatterIds(entraId),
        readStoredOutstandingBalances({ warmSync: true }),
      ]);

      if (matterIds.length === 0) {
        return buildPublicResponse([], {
          source: snapshot.source,
          scopedBy: 'matters-table',
        });
      }

      const data = snapshot.rows.filter((balance) =>
        Array.isArray(balance?.associated_matter_ids)
        && balance.associated_matter_ids.some((matterId) => matterIds.includes(Number(matterId)))
      );

      trackMetric('Reporting.OutstandingBalances.UserReadDuration', Date.now() - startedAt, {
        dataset: DATASET_KEY,
      });

      return buildPublicResponse(data, {
        source: snapshot.source,
        scopedBy: 'matters-table',
        rowCount: data.length,
      });
    }, CACHE_TTL_SECONDS);

    res.json(balancesData);
  } catch (error) {
    console.error('[OutstandingBalances] User read error:', error.message || error);
    res.status(500).json({ error: 'Error retrieving outstanding balances' });
  }
});

/**
 * GET /api/outstanding-balances
 * Returns table-backed outstanding balances, warming the table on first read.
 */
router.get('/', async (req, res) => {
  try {
    const forceLive = String(req.query.source || '').toLowerCase() === 'live';

    if (forceLive) {
      return res.json(await getOutstandingBalancesSnapshot({ forceLive: true }));
    }

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'outstanding-balances-v2', today);

    const balancesData = await cacheWrapper(cacheKey, async () => {
      return getOutstandingBalancesSnapshot({ forceLive: false });
    }, CACHE_TTL_SECONDS);

    res.json(balancesData);
  } catch (error) {
    console.error('[OutstandingBalances] Read error:', error.message || error);
    res.status(500).json({
      error: 'Error retrieving outstanding client balances',
    });
  }
});

// R7: realtime change notifications.
attachOutstandingBalancesStream(router);

module.exports = router;
module.exports.getOutstandingBalancesSnapshot = getOutstandingBalancesSnapshot;
