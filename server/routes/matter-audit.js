const express = require('express');
const fetch = require('node-fetch');
const { getSecret } = require('../utils/getSecret');
const { withRequest } = require('../utils/db');

const router = express.Router();

const CLIO_BASE = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';

const tokenCache = new Map();

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
    console.error('[matter-audit] Failed to resolve initials:', err.message || err);
    return null;
  }
}

async function resolveClioMatterIdFromInstructions(instructionRef) {
  const connectionString = process.env.SQL_CONNECTION_STRING_VNET || process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) return null;
  if (!instructionRef) return null;
  try {
    const result = await withRequest(connectionString, async (request, sqlClient) => {
      request.input('instructionRef', sqlClient.NVarChar, String(instructionRef).trim());
      const res = await request.query(`
        SELECT TOP 1 MatterId
        FROM Instructions
        WHERE InstructionRef = @instructionRef
      `);
      return res.recordset?.[0]?.MatterId || null;
    });
    const asNumber = result ? Number(result) : null;
    return Number.isFinite(asNumber) ? asNumber : null;
  } catch (err) {
    console.error('[matter-audit] Instruction matter lookup failed:', err.message || err);
    return null;
  }
}

const normalize = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

const normalizeDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const buildField = (key, label, localValue, clioValue, options = {}) => {
  const local = options.date ? normalizeDate(localValue) : normalize(localValue);
  const clio = options.date ? normalizeDate(clioValue) : normalize(clioValue);
  const bothEmpty = !local && !clio;
  const match = bothEmpty || local === clio;
  let status = 'match';
  if (bothEmpty) status = 'missing';
  else if (!match) status = 'mismatch';
  return {
    key,
    label,
    local: localValue || null,
    clio: clioValue || null,
    status,
  };
};

router.post('/', async (req, res) => {
  try {
    const {
      clioMatterId: clioMatterIdRaw,
      instructionRef,
      entraId,
      initials: initialsRaw,
      local,
    } = req.body || {};

    let initials = String(initialsRaw || req.user?.initials || process.env.CLIO_USER_INITIALS || '').trim();
    if (!initials && entraId) {
      const resolved = await resolveInitialsFromEntraId(entraId);
      if (resolved) initials = String(resolved).trim();
    }

    if (!initials) {
      return res.status(400).json({ error: 'initials are required' });
    }

    let clioMatterId = null;
    const clioMatterNumber = Number(clioMatterIdRaw);
    if (Number.isFinite(clioMatterNumber)) {
      clioMatterId = clioMatterNumber;
    }

    if (!clioMatterId) {
      clioMatterId = await resolveClioMatterIdFromInstructions(instructionRef);
    }

    if (!clioMatterId) {
      return res.json({ status: 'unlinked', reason: 'missing_clio_id' });
    }

    const fields = 'id,display_number,description,open_date';
    const baseUrl = `${CLIO_BASE}/matters/${clioMatterId}.json`;
    let resp = await fetchClioWithRetry(initials, `${baseUrl}?fields=${encodeURIComponent(fields)}`);
    let errorText = '';

    if (!resp.ok) {
      errorText = await resp.text();
      if (
        resp.status === 400 &&
        errorText.includes('InvalidFields') &&
        (errorText.includes('open_date') || errorText.includes('opened_date'))
      ) {
        const fallbackFields = 'id,display_number,description';
        resp = await fetchClioWithRetry(initials, `${baseUrl}?fields=${encodeURIComponent(fallbackFields)}`);
        if (!resp.ok) {
          const retryText = await resp.text();
          throw new Error(`Clio matter fetch error: ${resp.status} ${retryText}`);
        }
      } else {
        throw new Error(`Clio matter fetch error: ${resp.status} ${errorText}`);
      }
    }

    const data = await resp.json();
    const clioMatter = data?.data || {};

    const fieldsAudit = [
      buildField('displayNumber', 'Display number', local?.displayNumber, clioMatter.display_number),
      buildField('description', 'Description', local?.description, clioMatter.description),
      buildField('openDate', 'Open date', local?.openDate, clioMatter.open_date, { date: true }),
    ];

    return res.json({
      status: 'linked',
      clioMatterId,
      fields: fieldsAudit,
    });
  } catch (error) {
    console.error('[matter-audit] Failed to audit matter:', error.message || error);
    return res.status(500).json({ error: 'Failed to audit matter sync' });
  }
});

module.exports = router;
