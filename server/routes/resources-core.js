const express = require('express');
const https = require('https');
const { URLSearchParams } = require('url');
const { withRequest } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { getClioAccessToken, CLIO_API_BASE: clioApiBaseUrl } = require('../utils/clioAuth');

const router = express.Router();
const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID || '1203336123398249';

let netDocumentsTokenCache = { token: null, exp: 0 };

async function safeGetSecret(name) {
  try {
    return await getSecret(name);
  } catch {
    return null;
  }
}

async function getNetDocumentsAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (netDocumentsTokenCache.token && netDocumentsTokenCache.exp - 90 > now) {
    return netDocumentsTokenCache.token;
  }

  const [authUrl, tokenUrlFallback, basicKey, scope, serviceClientId, serviceClientSecret, repository] = await Promise.all([
    safeGetSecret('nd-authurl'),
    safeGetSecret('nd-accesstokenurl'),
    safeGetSecret('nd-basic-key'),
    safeGetSecret('nd-scope'),
    safeGetSecret('nd-serviceaccount-clientid'),
    safeGetSecret('nd-serviceaccount-clientsecret'),
    safeGetSecret('nd-repository')
  ]);

  const tokenUrl = authUrl || tokenUrlFallback;

  if (!tokenUrl) {
    throw new Error('NetDocuments OAuth credentials are missing.');
  }

  if (!basicKey && (!serviceClientId || !serviceClientSecret)) {
    throw new Error('NetDocuments credentials are missing.');
  }

  if (/\/neWeb2/i.test(tokenUrl) || !/\/oauth/i.test(tokenUrl)) {
    throw new Error(
      `NetDocuments token URL must be the API OAuth endpoint (e.g. https://api.eu.netdocuments.com/v1/OAuth). Current value: ${tokenUrl}`
    );
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json'
  };

  let tokenBasic = '';
  let finalClientId = '';
  if (serviceClientId && serviceClientSecret) {
    const needsRepoSuffix = repository && !serviceClientId.includes('|');
    finalClientId = needsRepoSuffix ? `${serviceClientId}|${repository}` : serviceClientId;
    tokenBasic = Buffer.from(`${finalClientId}:${serviceClientSecret}`).toString('base64');
  } else if (basicKey) {
    const trimmedBasic = String(basicKey).replace(/^Basic\s+/i, '').trim();
    tokenBasic = trimmedBasic.includes(':')
      ? Buffer.from(trimmedBasic).toString('base64')
      : trimmedBasic;
  }

  if (tokenBasic) {
    headers.Authorization = `Basic ${tokenBasic}`;
  }

  // Use raw string body (not URLSearchParams) - NetDocuments API requires literal space in scope
  const bodyStr = `grant_type=client_credentials&scope=${scope || 'datatables_full full'}`;
  headers['Content-Length'] = Buffer.byteLength(bodyStr);

  // Use native https module - Node's fetch has issues with NetDocuments API
  const tokenData = await new Promise((resolve, reject) => {
    const urlObj = new URL(tokenUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Failed to obtain NetDocuments access token: ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse NetDocuments token response: ${data}`));
          }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('NetDocuments token request timed out'));
    });
    req.write(bodyStr);
    req.end();
  });
  const accessToken = tokenData.access_token || tokenData.token;
  if (!accessToken) {
    throw new Error('NetDocuments access token missing from response.');
  }

  netDocumentsTokenCache = { token: accessToken, exp: now + (tokenData.expires_in || 3600) };
  return accessToken;
}

function normaliseNetDocumentsResults(payload) {
  const candidates = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.workspaces)
    ? payload.workspaces
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return candidates
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = item.name || item.title || item.workspaceName || '';
      const id = item.id || item.workspaceId || item.guid || '';
      const key = item.key || item.workspaceKey || item.workspaceId || item.id || '';
      const url = item.url || item.link || '';
      if (!name && !id && !key) return null;
      return {
        id: String(id || ''),
        name: String(name || ''),
        key: String(key || ''),
        url: url ? String(url) : ''
      };
    })
    .filter(Boolean);
}

async function getAsanaCredentials({ email, initials, entraId }) {
  const hasEmail = typeof email === 'string' && email.trim().length > 0;
  const hasInitials = typeof initials === 'string' && initials.trim().length > 0;
  const hasEntraId = typeof entraId === 'string' && entraId.trim().length > 0;
  if (!hasEmail && !hasInitials && !hasEntraId) return null;

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SQL connection not configured.');
  }

  return withRequest(connectionString, async (request, sqlClient) => {
    const filters = [];
    if (hasEmail) {
      request.input('email', sqlClient.VarChar(255), email.trim().toLowerCase());
      filters.push('LOWER([Email]) = @email');
    }
    if (hasInitials) {
      request.input('initials', sqlClient.VarChar(10), initials.trim().toUpperCase());
      filters.push('UPPER([Initials]) = @initials');
    }
    if (hasEntraId) {
      request.input('entraId', sqlClient.NVarChar(255), entraId.trim());
      filters.push('[Entra ID] = @entraId');
    }

    const query = `
      SELECT TOP 1 [ASANAClient_ID], [ASANASecret], [ASANARefreshToken]
      FROM [dbo].[team]
      WHERE ${filters.join(' OR ')}
    `;

    const result = await request.query(query);
    const row = result.recordset?.[0];
    if (!row?.ASANAClient_ID || !row?.ASANASecret || !row?.ASANARefreshToken) return null;
    return {
      clientId: row.ASANAClient_ID,
      secret: row.ASANASecret,
      refreshToken: row.ASANARefreshToken
    };
  });
}

async function getAsanaAccessToken(credentials) {
  if (!credentials) return null;
  const tokenBody = new URLSearchParams();
  tokenBody.append('grant_type', 'refresh_token');
  tokenBody.append('client_id', credentials.clientId);
  tokenBody.append('client_secret', credentials.secret);
  tokenBody.append('refresh_token', credentials.refreshToken);

  const tokenResponse = await fetch('https://app.asana.com/-/oauth_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
    timeout: 10000
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to refresh Asana access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token || null;
}

async function resolveAsanaAccessToken({ email, initials, entraId }) {
  let accessToken = typeof process.env.ASANA_ACCESS_TOKEN === 'string'
    ? process.env.ASANA_ACCESS_TOKEN.trim()
    : '';

  if (!accessToken) {
    const creds = await getAsanaCredentials({ email, initials, entraId });
    if (!creds) return null;
    accessToken = await getAsanaAccessToken(creds);
  }

  return accessToken || null;
}

// GET /api/resources/core/clio-contact?email=<email>
router.get('/clio-contact', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email.' });
  }

  try {
    const accessToken = await getClioAccessToken();
    const searchUrl = `${clioApiBaseUrl}/contacts.json?fields=id,name,primary_email_address,primary_phone_number,type&query=${encodeURIComponent(email)}&limit=10`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Clio search failed.' });
    }

    const payload = await response.json();
    const results = (payload.data || []).map((contact) => ({
      id: String(contact.id || ''),
      name: contact.name || '',
      email: contact.primary_email_address || '',
      phone: contact.primary_phone_number || '',
      type: contact.type || ''
    }));

    return res.json({ ok: true, results });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Clio contact lookup failed.' });
  }
});

// GET /api/resources/core/clio-matter?q=<matter display number or query>
router.get('/clio-matter', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: 'Missing query.' });
  }

  try {
    const accessToken = await getClioAccessToken();
    const searchUrl = `${clioApiBaseUrl}/matters.json?fields=id,display_number,description,status,client{name,id}&query=${encodeURIComponent(query)}&limit=10`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Clio matter search failed.' });
    }

    const payload = await response.json();
    const results = (payload.data || []).map((matter) => ({
      id: String(matter.id || ''),
      displayNumber: matter.display_number || '',
      description: matter.description || '',
      status: matter.status || '',
      clientName: matter.client?.name || '',
      clientId: matter.client?.id ? String(matter.client.id) : ''
    }));

    return res.json({ ok: true, results });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Clio matter lookup failed.' });
  }
});

// GET /api/resources/core/netdocuments-workspace?q=<clientId/matterKey>
// Example: ?q=5257922/HELIX01-01
router.get('/netdocuments-workspace', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: 'Missing workspace reference. Format: clientId/matterKey (e.g., 5257922/HELIX01-01)' });
  }

  // Parse clientId/matterKey format
  const parts = query.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return res.status(400).json({ ok: false, error: 'Invalid format. Use clientId/matterKey (e.g., 5257922/HELIX01-01)' });
  }
  const [clientId, matterKey] = parts;

  try {
    const [baseUrl, cabinet] = await Promise.all([
      getSecret('nd-baseurl'),
      getSecret('nd-cabinet')
    ]);
    const accessToken = await getNetDocumentsAccessToken();

    if (!baseUrl) {
      return res.status(500).json({ ok: false, error: 'NetDocuments base URL missing.' });
    }
    if (!cabinet) {
      return res.status(500).json({ ok: false, error: 'NetDocuments cabinet ID missing.' });
    }

    // /v1/Workspace/{cabinet}/{clientId}/{matterKey}/info
    const urlObj = new URL(`${baseUrl.replace(/\/$/, '')}/v1/Workspace/${cabinet}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}/info`);

    // Use native https module for consistency with OAuth
    const payload = await new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      };
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          if (response.statusCode === 404) {
            reject({ status: 404, message: `Workspace not found: ${clientId}/${matterKey}` });
          } else if (response.statusCode >= 400) {
            reject({ status: response.statusCode, message: data || 'NetDocuments lookup failed.' });
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject({ status: 500, message: `Failed to parse response: ${data}` });
            }
          }
        });
      });
      request.on('error', (e) => reject({ status: 500, message: e.message }));
      request.setTimeout(15000, () => {
        request.destroy();
        reject({ status: 504, message: 'NetDocuments request timed out' });
      });
      request.end();
    });

    // Extract useful info from the response
    const result = {
      id: payload.standardAttributes?.id,
      name: payload.standardAttributes?.name,
      url: payload.standardAttributes?.url,
      created: payload.standardAttributes?.created,
      createdBy: payload.standardAttributes?.createdBy,
      modified: payload.standardAttributes?.modified,
      modifiedBy: payload.standardAttributes?.modifiedBy,
      client: payload.customAttributes?.find(a => a.id === 1)?.description,
      clientId: payload.customAttributes?.find(a => a.id === 1)?.value,
      matter: payload.customAttributes?.find(a => a.id === 2)?.description,
      matterKey: payload.customAttributes?.find(a => a.id === 2)?.value,
      archived: payload.misc?.archived,
      deleted: payload.misc?.deleted
    };

    return res.json({ ok: true, result });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// Helper: make NetDocuments API request using native https
async function ndApiRequest(path, accessToken, method = 'GET', body = null) {
  const baseUrl = await getSecret('nd-baseurl');
  if (!baseUrl) throw { status: 500, message: 'NetDocuments base URL missing.' };
  
  const urlObj = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      }
    };
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        if (response.statusCode >= 400) {
          reject({ status: response.statusCode, message: data || `NetDocuments error ${response.statusCode}` });
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject({ status: 500, message: `Failed to parse response: ${data}` });
          }
        }
      });
    });
    request.on('error', (e) => reject({ status: 500, message: e.message }));
    request.setTimeout(15000, () => {
      request.destroy();
      reject({ status: 504, message: 'NetDocuments request timed out' });
    });
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

// GET /api/resources/core/netdocuments-user
// Returns current user's membership info
router.get('/netdocuments-user', async (req, res) => {
  try {
    const accessToken = await getNetDocumentsAccessToken();
    const payload = await ndApiRequest('/v2/user/membership', accessToken);
    return res.json({ ok: true, result: payload });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments user lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-container/:id
// Returns contents of a container (workspace, folder, etc.)
router.get('/netdocuments-container/:id', async (req, res) => {
  const containerId = String(req.params.id || '').trim();
  if (!containerId) {
    return res.status(400).json({ ok: false, error: 'Missing container ID.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const payload = await ndApiRequest(`/v2/container/${encodeURIComponent(containerId)}`, accessToken);
    
    // Normalize the response
    const items = (payload.standardList || []).map(item => ({
      id: item.envId || item.id,
      name: item.name,
      type: item.extension ? 'document' : 'container',
      extension: item.extension,
      size: item.size,
      created: item.created,
      modified: item.modified,
      modifiedBy: item.modifiedBy,
      version: item.version,
      locked: item.locked,
      url: item.url
    }));

    return res.json({ ok: true, result: { items, total: items.length } });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments container lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-workspace-contents
// Returns contents of a workspace using the v1 Workspace API, then enriches with v2 sub for names
// Query params: clientId, matterKey
router.get('/netdocuments-workspace-contents', async (req, res) => {
  const clientId = String(req.query.clientId || '').trim();
  const matterKey = String(req.query.matterKey || '').trim();
  
  if (!clientId || !matterKey) {
    return res.status(400).json({ ok: false, error: 'Missing clientId or matterKey.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const cabinet = await getSecret('nd-cabinet');
    if (!cabinet) throw { status: 500, message: 'NetDocuments cabinet ID missing.' };
    
    // Use the v1 Workspace API: /v1/Workspace/{cabinet}/{clientId}/{matterKey}
    const path = `/v1/Workspace/${encodeURIComponent(cabinet)}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}`;
    const payload = await ndApiRequest(path, accessToken);
    
    // v1 returns { list: [{ envId, type }] } - minimal info
    // For each folder, we need to fetch info to get the name
    const rawItems = payload.list || [];
    
    // Enrich items with names using parallel info calls
    const items = await Promise.all(rawItems.map(async (item) => {
      const isFolder = item.type === 'fld';
      let name = item.envId;
      
      try {
        // For folders, try to get info
        if (isFolder) {
          const infoPath = `/v2/container/${encodeURIComponent(item.envId)}/info`;
          const info = await ndApiRequest(infoPath, accessToken);
          name = info?.standardAttributes?.name || info?.name || item.envId;
        } else {
          // For documents, use document info
          const infoPath = `/v2/document/${encodeURIComponent(item.envId)}/info`;
          const info = await ndApiRequest(infoPath, accessToken);
          name = info?.standardAttributes?.name || info?.name || item.envId;
        }
      } catch (e) {
        // Keep envId as name if info fails
      }
      
      return {
        id: item.envId,
        name,
        type: isFolder ? 'container' : 'document',
        extension: !isFolder ? item.type : undefined,
        url: item.url
      };
    }));

    return res.json({ ok: true, result: { items, total: items.length } });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments workspace contents lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-folder-contents/:id
// Returns contents of a folder using the v2 container sub endpoint with StandardAttributes
router.get('/netdocuments-folder-contents/:id', async (req, res) => {
  const folderId = String(req.params.id || '').trim();
  
  if (!folderId) {
    return res.status(400).json({ ok: false, error: 'Missing folder ID.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    
    // Use v2 container sub API with StandardAttributes: /v2/container/{id}/sub?select=StandardAttributes
    const path = `/v2/container/${encodeURIComponent(folderId)}/sub?select=StandardAttributes`;
    const payload = await ndApiRequest(path, accessToken);
    
    // Normalize the response - v2 sub returns { Results: [{ DocId, EnvId, Attributes: { Name, Ext, ... } }] }
    const items = (payload.Results || []).map(item => {
      const attrs = item.Attributes || {};
      const isFolder = attrs.Ext === 'ndfld';
      return {
        id: item.EnvId || item.DocId,
        name: attrs.Name || item.EnvId || item.DocId,
        type: isFolder ? 'container' : 'document',
        extension: !isFolder ? attrs.Ext : undefined,
        size: attrs.Size,
        created: attrs.Created,
        createdBy: attrs.CreatedBy,
        modified: attrs.Modified,
        modifiedBy: attrs.ModifiedBy,
        url: item.url
      };
    });

    return res.json({ ok: true, result: { items, total: items.length } });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments folder contents lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-container/:id/info
// Returns info about a specific container
router.get('/netdocuments-container/:id/info', async (req, res) => {
  const containerId = String(req.params.id || '').trim();
  if (!containerId) {
    return res.status(400).json({ ok: false, error: 'Missing container ID.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const payload = await ndApiRequest(`/v2/container/${encodeURIComponent(containerId)}/info`, accessToken);
    return res.json({ ok: true, result: payload });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments container info failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-container/:id/sub
// Returns sub-containers (folders) within a container
router.get('/netdocuments-container/:id/sub', async (req, res) => {
  const containerId = String(req.params.id || '').trim();
  const recursive = req.query.recursive === 'true';
  const max = parseInt(req.query.max, 10) || 100;

  if (!containerId) {
    return res.status(400).json({ ok: false, error: 'Missing container ID.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const path = recursive 
      ? `/v2/container/${encodeURIComponent(containerId)}/sub/true/${max}`
      : `/v2/container/${encodeURIComponent(containerId)}/sub`;
    const payload = await ndApiRequest(path, accessToken);
    
    const containers = (payload.standardList || payload || []).map(item => ({
      id: item.envId || item.id,
      name: item.name,
      type: 'container',
      parentId: item.parentId,
      created: item.created,
      modified: item.modified
    }));

    return res.json({ ok: true, result: { containers, total: containers.length } });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments sub-containers lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-document/:id
// Returns info about a specific document
router.get('/netdocuments-document/:id', async (req, res) => {
  const docId = String(req.params.id || '').trim();
  if (!docId) {
    return res.status(400).json({ ok: false, error: 'Missing document ID.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const payload = await ndApiRequest(`/v2/document/${encodeURIComponent(docId)}/info`, accessToken);
    
    const result = {
      id: payload.standardAttributes?.id,
      name: payload.standardAttributes?.name,
      extension: payload.standardAttributes?.extension,
      size: payload.standardAttributes?.size,
      version: payload.standardAttributes?.version,
      created: payload.standardAttributes?.created,
      createdBy: payload.standardAttributes?.createdBy,
      modified: payload.standardAttributes?.modified,
      modifiedBy: payload.standardAttributes?.modifiedBy,
      locked: payload.standardAttributes?.locked,
      url: payload.standardAttributes?.url,
      cabinet: payload.standardAttributes?.cabinet,
      customAttributes: payload.customAttributes
    };

    return res.json({ ok: true, result });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments document lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-search?q=<query>&container=<id>&cabinet=<id>
// Search documents within a cabinet or container using v2 Search API with StandardAttributes
router.get('/netdocuments-search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const containerId = String(req.query.container || '').trim();
  const cabinetId = String(req.query.cabinet || '').trim();
  const limit = parseInt(req.query.limit, 10) || 25;

  if (!query) {
    return res.status(400).json({ ok: false, error: 'Missing search query.' });
  }

  try {
    const accessToken = await getNetDocumentsAccessToken();
    const cabinet = cabinetId || await getSecret('nd-cabinet');
    
    // Build search path using v2 Search API
    // Format: /v2/Search/{cabinet}?q==3(query)&select=StandardAttributes
    // =3 means search by document name
    let path;
    if (containerId) {
      // Search within a specific container - use container search endpoint
      path = `/v2/container/${encodeURIComponent(containerId)}/search?q=${encodeURIComponent(query)}&max=${limit}&select=StandardAttributes`;
    } else if (cabinet) {
      // Search within cabinet using the v2 Search endpoint
      // =3(query) searches by document name (field 3)
      path = `/v2/Search/${encodeURIComponent(cabinet)}?q==3(${encodeURIComponent(query)})&select=StandardAttributes&max=${limit}`;
    } else {
      return res.status(400).json({ ok: false, error: 'Cabinet ID required for search.' });
    }

    const payload = await ndApiRequest(path, accessToken);
    
    // v2 Search returns { Results: [{ DocId, EnvId, Attributes: { Name, Ext, ... } }], Search: { ... } }
    // Container search returns { standardList: [...] }
    let results = [];
    
    if (payload.Results) {
      // v2 Search response format
      results = (payload.Results || []).map(item => {
        const attrs = item.Attributes || {};
        const isFolder = attrs.Ext === 'ndfld';
        return {
          id: item.EnvId || item.DocId,
          docId: item.DocId,
          name: attrs.Name || item.EnvId,
          type: isFolder ? 'container' : 'document',
          extension: !isFolder ? attrs.Ext : undefined,
          size: attrs.Size,
          created: attrs.Created,
          createdBy: attrs.CreatedBy,
          modified: attrs.Modified,
          modifiedBy: attrs.ModifiedBy,
          url: item.url,
          cabinet: attrs.Cabinet,
          parentName: attrs.ParentName
        };
      });
    } else if (payload.standardList) {
      // Container search response format
      results = (payload.standardList || []).map(item => ({
        id: item.envId || item.id,
        name: item.name,
        type: item.extension ? 'document' : 'container',
        extension: item.extension,
        size: item.size,
        created: item.created,
        modified: item.modified,
        modifiedBy: item.modifiedBy,
        version: item.version,
        url: item.url,
        cabinet: item.cabinet,
        parentName: item.parentName
      }));
    }

    // Include search metadata if available
    const searchMeta = payload.Search || {};

    return res.json({ 
      ok: true, 
      result: { 
        items: results, 
        total: payload.Total || results.length,
        query,
        searchId: searchMeta.SearchId,
        searchName: searchMeta.Name,
        scope: containerId ? 'container' : 'cabinet'
      } 
    });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments search failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/netdocuments-recent?type=<documents|workspaces>
// Returns user's recently accessed items
router.get('/netdocuments-recent', async (req, res) => {
  const type = String(req.query.type || 'documents').trim().toLowerCase();
  const cabinet = String(req.query.cabinet || '').trim();

  try {
    const accessToken = await getNetDocumentsAccessToken();
    let path;
    
    if (type === 'workspaces') {
      path = cabinet 
        ? `/v2/user/recent/workspaces/${encodeURIComponent(cabinet)}`
        : '/v2/user/recent/workspaces';
    } else {
      path = '/v2/document/recent/edited';
    }

    const payload = await ndApiRequest(path, accessToken);
    
    const items = (payload.standardList || payload || []).map(item => ({
      id: item.envId || item.id,
      name: item.name,
      type: item.extension ? 'document' : 'workspace',
      extension: item.extension,
      modified: item.modified || item.lastAccessed,
      modifiedBy: item.modifiedBy,
      url: item.url
    }));

    return res.json({ ok: true, result: { items, total: items.length, type } });
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'NetDocuments recent items failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/resources/core/asana-task?id=<task_gid>&email=<email>&initials=<initials>
router.get('/asana-task', async (req, res) => {
  const taskId = String(req.query.id || req.query.gid || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!taskId) {
    return res.status(400).json({ ok: false, error: 'Missing task id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const fields = [
      'gid',
      'name',
      'completed',
      'assignee.name',
      'assignee.email',
      'created_at',
      'modified_at',
      'due_on',
      'permalink_url',
      'notes',
      'projects.name',
      'tags.name',
      'workspace.name'
    ].join(',');

    const response = await fetch(`${ASANA_BASE_URL}/tasks/${encodeURIComponent(taskId)}?opt_fields=${encodeURIComponent(fields)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Asana task lookup failed.' });
    }

    const payload = await response.json();
    const task = payload?.data || {};
    const result = {
      id: String(task.gid || ''),
      name: task.name || '',
      completed: Boolean(task.completed),
      dueOn: task.due_on || '',
      assigneeName: task.assignee?.name || '',
      assigneeEmail: task.assignee?.email || '',
      url: task.permalink_url || '',
      projects: (task.projects || []).map((project) => project?.name).filter(Boolean),
      tags: (task.tags || []).map((tag) => tag?.name).filter(Boolean),
      workspace: task.workspace?.name || '',
      notes: task.notes || '',
      createdAt: task.created_at || '',
      updatedAt: task.modified_at || ''
    };

    return res.json({ ok: true, task: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana task lookup failed.' });
  }
});

// GET /api/resources/core/asana-teams?workspaceId=<id>&email=<email>&initials=<initials>&entraId=<entraId>
router.get('/asana-teams', async (req, res) => {
  const workspaceId = String(req.query.workspaceId || ASANA_WORKSPACE_ID || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!workspaceId) {
    return res.status(400).json({ ok: false, error: 'Missing workspace id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const url = `${ASANA_BASE_URL}/teams?workspace=${encodeURIComponent(workspaceId)}&opt_fields=name,gid`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Asana teams lookup failed.' });
    }

    const payload = await response.json();
    const teams = (payload.data || []).map((team) => ({
      id: String(team.gid || ''),
      name: team.name || ''
    }));

    return res.json({ ok: true, teams });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana teams lookup failed.' });
  }
});

// GET /api/resources/core/asana-projects?teamId=<id>&email=<email>&initials=<initials>&entraId=<entraId>
router.get('/asana-projects', async (req, res) => {
  const teamId = String(req.query.teamId || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!teamId) {
    return res.status(400).json({ ok: false, error: 'Missing team id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const url = `${ASANA_BASE_URL}/projects?team=${encodeURIComponent(teamId)}&opt_fields=name,gid,archived`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Asana projects lookup failed.' });
    }

    const payload = await response.json();
    const projects = (payload.data || []).map((project) => ({
      id: String(project.gid || ''),
      name: project.name || '',
      archived: Boolean(project.archived)
    }));

    return res.json({ ok: true, projects });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana projects lookup failed.' });
  }
});

// GET /api/resources/core/asana-sections?projectId=<id>&email=<email>&initials=<initials>&entraId=<entraId>
router.get('/asana-sections', async (req, res) => {
  const projectId = String(req.query.projectId || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!projectId) {
    return res.status(400).json({ ok: false, error: 'Missing project id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const url = `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectId)}/sections?opt_fields=name,gid`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Asana sections lookup failed.' });
    }

    const payload = await response.json();
    const sections = (payload.data || []).map((section) => ({
      id: String(section.gid || ''),
      name: section.name || ''
    }));

    return res.json({ ok: true, sections });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana sections lookup failed.' });
  }
});

// GET /api/resources/core/asana-project-silos?projectId=<id>&email=<email>&initials=<initials>&entraId=<entraId>
router.get('/asana-project-silos', async (req, res) => {
  const projectId = String(req.query.projectId || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!projectId) {
    return res.status(400).json({ ok: false, error: 'Missing project id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const sectionsResponse = await fetch(
      `${ASANA_BASE_URL}/projects/${encodeURIComponent(projectId)}/sections?opt_fields=name,gid`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      }
    );

    if (!sectionsResponse.ok) {
      const text = await sectionsResponse.text();
      return res.status(sectionsResponse.status).json({ ok: false, error: text || 'Asana sections lookup failed.' });
    }

    const sectionsPayload = await sectionsResponse.json();
    const sections = (sectionsPayload.data || []).map((section) => ({
      id: String(section.gid || ''),
      name: section.name || ''
    }));

    const tasksBySection = await Promise.all(
      sections.map(async (section) => {
        const tasksResponse = await fetch(
          `${ASANA_BASE_URL}/sections/${encodeURIComponent(section.id)}/tasks?completed_since=now&opt_fields=gid,name,completed,assignee.name,assignee.email,permalink_url,due_on&limit=50`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
          }
        );

        if (!tasksResponse.ok) {
          const text = await tasksResponse.text();
          return { ...section, tasks: [], error: text || 'Asana tasks lookup failed.' };
        }

        const tasksPayload = await tasksResponse.json();
        const tasks = (tasksPayload.data || []).map((task) => ({
          id: String(task.gid || ''),
          name: task.name || '',
          completed: Boolean(task.completed),
          assigneeName: task.assignee?.name || '',
          assigneeEmail: task.assignee?.email || '',
          dueOn: task.due_on || '',
          url: task.permalink_url || ''
        }));

        return { ...section, tasks };
      })
    );

    return res.json({ ok: true, sections: tasksBySection });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana project silos lookup failed.' });
  }
});

// GET /api/resources/core/asana-users?teamId=<id>&workspaceId=<id>&email=<email>&initials=<initials>&entraId=<entraId>
router.get('/asana-users', async (req, res) => {
  const teamId = String(req.query.teamId || '').trim();
  const workspaceId = String(req.query.workspaceId || ASANA_WORKSPACE_ID || '').trim();
  const email = String(req.query.email || '').trim();
  const initials = String(req.query.initials || '').trim();
  const entraId = String(req.query.entraId || '').trim();

  if (!teamId && !workspaceId) {
    return res.status(400).json({ ok: false, error: 'Missing team or workspace id.' });
  }

  try {
    const accessToken = await resolveAsanaAccessToken({ email, initials, entraId });
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Asana access token.' });
    }

    const base = `${ASANA_BASE_URL}/users`;
    const params = new URLSearchParams();
    if (teamId) params.set('team', teamId);
    if (!teamId && workspaceId) params.set('workspace', workspaceId);
    params.set('opt_fields', 'name,gid,email');

    const response = await fetch(`${base}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ ok: false, error: text || 'Asana users lookup failed.' });
    }

    const payload = await response.json();
    const users = (payload.data || []).map((user) => ({
      id: String(user.gid || ''),
      name: user.name || '',
      email: user.email || ''
    }));

    return res.json({ ok: true, users });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Asana users lookup failed.' });
  }
});

module.exports = router;