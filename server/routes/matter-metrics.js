const express = require('express');
const fetch = require('node-fetch');
const { getSecret } = require('../utils/getSecret');
const { withRequest } = require('../utils/db');

const router = express.Router();

const CLIO_BASE = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';

const tokenCache = new Map();
const responseCache = new Map();

const CACHE_TTL_MS = 2 * 60 * 1000;

function getCache(key) {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCache(key, data) {
  responseCache.set(key, { data, timestamp: Date.now() });
}

async function getClioAccessToken(initials, options = {}) {
  const { forceRefresh = false } = options;
  const key = initials.toLowerCase();
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

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const resp = await fetch(`${CLIO_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Failed to refresh Clio token: ${errorText}`);
  }

  const tokenData = await resp.json();
  const accessToken = tokenData.access_token;
  const expiresIn = Number(tokenData.expires_in || 3600) * 1000;
  tokenCache.set(key, { token: accessToken, expiresAt: Date.now() + expiresIn - 60 * 1000 });
  return accessToken;
}

async function fetchClioWithRetry(initials, url, options = {}) {
  let accessToken = await getClioAccessToken(initials);
  let resp = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (resp.status !== 401) {
    return resp;
  }

  const key = initials.toLowerCase();
  tokenCache.delete(key);
  accessToken = await getClioAccessToken(initials, { forceRefresh: true });

  resp = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return resp;
}

async function resolveInitialsFromEntraId(entraId) {
  if (!entraId) return null;
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) return null;
  try {
    const result = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('entraId', sqlClient.NVarChar, entraId);
      const res = await request.query(`
        SELECT [Initials] FROM [dbo].[team] WHERE [Entra ID] = @entraId
      `);
      return res.recordset?.[0]?.Initials || null;
    });
    return result;
  } catch (err) {
    console.error('[matter-metrics] Failed to resolve initials:', err.message || err);
    return null;
  }
}

async function resolveClioMatterIdFromSql(matterIdRaw, displayNumber) {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) return null;

  const matterIdValue = matterIdRaw ? String(matterIdRaw).trim() : '';
  const displayValue = displayNumber ? String(displayNumber).trim() : '';

  if (!matterIdValue && !displayValue) return null;

  try {
    const result = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('matterId', sqlClient.NVarChar, matterIdValue || null);
      request.input('displayNumber', sqlClient.NVarChar, displayValue || null);
      const res = await request.query(`
        SELECT TOP 1 [Unique ID] AS clioMatterId
        FROM matters
        WHERE ([Display Number] = @displayNumber AND @displayNumber IS NOT NULL)
            OR ([Unique ID] = @matterId AND @matterId IS NOT NULL)
      `);
      return res.recordset?.[0]?.clioMatterId || null;
    });
    const asNumber = result ? Number(result) : null;
    return Number.isFinite(asNumber) ? asNumber : null;
  } catch (err) {
    console.error('[matter-metrics] SQL matter id lookup failed:', err.message || err);
    return null;
  }
}

async function resolveClioMatterIdFromInstructions({ instructionRef, displayNumber, matterIdRaw }) {
  const connectionString = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) return { clioMatterId: null, pendingReason: null };

  const instructionRefValue = instructionRef ? String(instructionRef).trim() : '';
  const displayValue = displayNumber ? String(displayNumber).trim() : '';
  const matterIdValue = matterIdRaw ? String(matterIdRaw).trim() : '';

  if (!instructionRefValue && !displayValue && !matterIdValue) {
    return { clioMatterId: null, pendingReason: null };
  }

  try {
    if (instructionRefValue) {
      const instResult = await withRequest(connectionString, async (request, sqlClient) => {
        request.input('instructionRef', sqlClient.NVarChar, instructionRefValue);
        const res = await request.query(`
          SELECT TOP 1 MatterId
          FROM Instructions
          WHERE InstructionRef = @instructionRef
        `);
        return res.recordset?.[0] || null;
      });

      const instMatterId = instResult?.MatterId;
      const instMatterNumber = instMatterId ? Number(instMatterId) : null;
      if (Number.isFinite(instMatterNumber)) {
        return { clioMatterId: instMatterNumber, pendingReason: null };
      }
    }

    const matterResult = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('instructionRef', sqlClient.NVarChar, instructionRefValue || null);
      request.input('displayNumber', sqlClient.NVarChar, displayValue || null);
      request.input('matterId', sqlClient.NVarChar, matterIdValue || null);
      const res = await request.query(`
        SELECT TOP 1 MatterID, Status, DisplayNumber
        FROM Matters
        WHERE (
          (@instructionRef IS NOT NULL AND InstructionRef = @instructionRef)
          OR (@displayNumber IS NOT NULL AND DisplayNumber = @displayNumber)
          OR (@matterId IS NOT NULL AND MatterID = @matterId)
        )
        ORDER BY OpenDate DESC
      `);
      return res.recordset?.[0] || null;
    });

    if (!matterResult) {
      return { clioMatterId: null, pendingReason: null };
    }

    const statusValue = matterResult.Status ? String(matterResult.Status).trim() : '';
    const matterNumber = matterResult.MatterID ? Number(matterResult.MatterID) : null;
    if (Number.isFinite(matterNumber) && statusValue !== 'MatterRequest') {
      return { clioMatterId: matterNumber, pendingReason: null };
    }

    return {
      clioMatterId: null,
      pendingReason: statusValue === 'MatterRequest' ? 'matter_request' : 'pending',
    };
  } catch (err) {
    console.error('[matter-metrics] Instructions matter lookup failed:', err.message || err);
    return { clioMatterId: null, pendingReason: null };
  }
}

async function fetchMatterActivities(initials, matterId, dateFrom, dateTo) {
  const activities = [];
  const limit = 200;
  let offset = 0;
  const fields = 'id,date,created_at,quantity_in_hours,total,non_billable,non_billable_total,billed,on_bill';

  while (true) {
    const params = new URLSearchParams({
      matter_id: String(matterId),
      fields,
      limit: String(limit),
      offset: String(offset),
    });

    if (dateFrom) {
      params.set('created_since', dateFrom);
    }
    if (dateTo) {
      params.set('created_before', dateTo);
    }

    const resp = await fetchClioWithRetry(initials, `${CLIO_BASE}/activities.json?${params.toString()}`);

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Clio activities error: ${resp.status} ${errorText}`);
    }

    const data = await resp.json();
    if (Array.isArray(data.data)) {
      activities.push(...data.data);
    }

    if (!data.meta?.paging?.next || data.data.length < limit) {
      break;
    }
    offset += limit;
  }

  return activities;
}

function aggregateActivities(activities) {
  let billableAmount = 0;
  let billableHours = 0;
  let unbilledBillableAmount = 0;
  let unbilledBillableHours = 0;
  let nonBillableAmount = 0;
  let nonBillableHours = 0;

  for (const activity of activities) {
    const hours = Number(activity.quantity_in_hours || 0);
    const amount = Number(activity.total || 0);
    const nonBillableTotal = Number(activity.non_billable_total || 0);
    const isNonBillable = activity.non_billable === true || String(activity.non_billable).toLowerCase() === 'true';
    const isBilled = activity.billed === true || String(activity.billed).toLowerCase() === 'true';
    const isOnBill = activity.on_bill === true || String(activity.on_bill).toLowerCase() === 'true';

    if (isNonBillable) {
      nonBillableHours += hours;
      nonBillableAmount += nonBillableTotal || amount || 0;
    } else {
      billableHours += hours;
      billableAmount += amount;
      if (!isBilled && !isOnBill) {
        unbilledBillableHours += hours;
        unbilledBillableAmount += amount;
      }
    }
  }

  const round1 = (n) => Math.round(n * 10) / 10;
  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    billableAmount: round2(unbilledBillableAmount),
    billableHours: round1(unbilledBillableHours),
    nonBillableAmount: round2(nonBillableAmount),
    nonBillableHours: round1(nonBillableHours),
    totalHours: round1(billableHours + nonBillableHours),
  };
}

router.get('/wip', async (req, res) => {
  try {
    const matterIdRaw = req.query.matterId;
    const matterIdNumber = Number(matterIdRaw);
    const matterId = Number.isFinite(matterIdNumber) ? matterIdNumber : null;
    const displayNumber = typeof req.query.displayNumber === 'string' ? req.query.displayNumber.trim() : '';
    const instructionRef = typeof req.query.instructionRef === 'string' ? req.query.instructionRef.trim() : '';
    const entraId = typeof req.query.entraId === 'string' ? req.query.entraId.trim() : '';
    let initials = String(req.query.initials || req.user?.initials || process.env.CLIO_USER_INITIALS || '').trim();
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;

    if (!initials && entraId) {
      const resolved = await resolveInitialsFromEntraId(entraId);
      if (resolved) initials = String(resolved).trim();
    }

    if (!initials) {
      return res.status(400).json({ error: 'initials are required' });
    }

    if (!matterIdRaw && !displayNumber) {
      return res.status(400).json({ error: 'matterId or displayNumber is required' });
    }

    const cacheKey = `wip:${matterId || displayNumber}:${dateFrom || 'na'}:${dateTo || 'na'}:${initials.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    let clioMatterId = matterId;
    if (!clioMatterId) {
      clioMatterId = await resolveClioMatterIdFromSql(matterIdRaw, displayNumber);
    }
    if (!clioMatterId) {
      const resolution = await resolveClioMatterIdFromInstructions({ instructionRef, displayNumber, matterIdRaw });
      clioMatterId = resolution.clioMatterId;
      if (!clioMatterId) {
        if (resolution.pendingReason) {
          const pendingPayload = { status: 'pending', reason: resolution.pendingReason };
          setCache(cacheKey, pendingPayload);
          return res.json(pendingPayload);
        }
        return res.status(404).json({ error: 'Clio matter not found' });
      }
    }

    const activities = await fetchMatterActivities(initials, clioMatterId, dateFrom, dateTo);
    const totals = aggregateActivities(activities);

    const payload = { ...totals, clioMatterId };
    setCache(cacheKey, payload);
    return res.json({ ...payload, cached: false });
  } catch (error) {
    console.error('[matter-metrics] WIP fetch failed:', error.message || error);
    return res.status(500).json({ error: 'Failed to fetch matter WIP' });
  }
});

router.get('/funds', async (req, res) => {
  try {
    const matterIdRaw = req.query.matterId;
    const matterIdNumber = Number(matterIdRaw);
    const matterId = Number.isFinite(matterIdNumber) ? matterIdNumber : null;
    const displayNumber = typeof req.query.displayNumber === 'string' ? req.query.displayNumber.trim() : '';
    const instructionRef = typeof req.query.instructionRef === 'string' ? req.query.instructionRef.trim() : '';
    const entraId = typeof req.query.entraId === 'string' ? req.query.entraId.trim() : '';
    let initials = String(req.query.initials || req.user?.initials || process.env.CLIO_USER_INITIALS || '').trim();

    if (!initials && entraId) {
      const resolved = await resolveInitialsFromEntraId(entraId);
      if (resolved) initials = String(resolved).trim();
    }

    if (!initials) {
      return res.status(400).json({ error: 'initials are required' });
    }

    if (!matterIdRaw && !displayNumber) {
      return res.status(400).json({ error: 'matterId or displayNumber is required' });
    }

    const cacheKey = `funds:${matterId || displayNumber}:${initials.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    let clioMatterId = matterId;
    if (!clioMatterId) {
      clioMatterId = await resolveClioMatterIdFromSql(matterIdRaw, displayNumber);
    }
    if (!clioMatterId) {
      const resolution = await resolveClioMatterIdFromInstructions({ instructionRef, displayNumber, matterIdRaw });
      clioMatterId = resolution.clioMatterId;
      if (!clioMatterId) {
        if (resolution.pendingReason) {
          const pendingPayload = { status: 'pending', reason: resolution.pendingReason };
          setCache(cacheKey, pendingPayload);
          return res.json(pendingPayload);
        }
        return res.status(404).json({ error: 'Clio matter not found' });
      }
    }
    const fields = 'account_balances';
    const resp = await fetchClioWithRetry(
      initials,
      `${CLIO_BASE}/matters/${clioMatterId}.json?fields=${encodeURIComponent(fields)}`
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Clio matter fetch error: ${resp.status} ${errorText}`);
    }

    const data = await resp.json();
    const balancesRaw = data?.data?.account_balances;
    const balances = Array.isArray(balancesRaw)
      ? balancesRaw
      : Array.isArray(balancesRaw?.data)
      ? balancesRaw.data
      : [];

    const clientFunds = balances.reduce((sum, entry) => {
      const amount = Number(
        entry?.balance ??
          entry?.total ??
          entry?.amount ??
          entry?.current_balance ??
          entry?.available_balance ??
          0
      );
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const payload = { clientFunds: Math.round(clientFunds * 100) / 100, clioMatterId };
    setCache(cacheKey, payload);
    return res.json({ ...payload, cached: false });
  } catch (error) {
    console.error('[matter-metrics] Funds fetch failed:', error.message || error);
    return res.status(500).json({ error: 'Failed to fetch matter funds' });
  }
});

module.exports = router;