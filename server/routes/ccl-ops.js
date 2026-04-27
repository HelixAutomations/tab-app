/**
 * CCL Operations — support tickets, Clio upload, NetDocuments upload.
 *
 * POST /api/ccl-ops/report     → Submit a CCL support ticket (→ tech_problems + Asana)
 * POST /api/ccl-ops/upload-clio → Upload generated .docx to Clio matter (legacy path)
 * POST /api/ccl-ops/upload-nd   → Upload generated .docx to the NetDocuments workspace
 * GET  /api/ccl-ops/integrations → Check which integrations are available for a matter
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const { getCclContentById, getLatestCclContent, markCclUploaded, saveCclSent, updateCclStatus } = require('../utils/cclPersistence');
const { sendHelixEmail } = require('../utils/helixEmail');
const { resolveRequestActor } = require('../utils/requestActor');

// CCL docx lives in public/ccls/{matterId}.docx (matches ccl.js)
const CCL_DIR = path.join(process.cwd(), 'public', 'ccls');
const CCL_OUTPUT_DIR = path.join(process.cwd(), 'logs', 'ccl-outputs');
const DEMO_ND_WORKSPACE_REF = process.env.CCL_ND_DEMO_WORKSPACE || '5257922/HELIX01-01';
const CCL_ND_UPLOAD_FOLDER = process.env.CCL_ND_UPLOAD_FOLDER || '4126-8772-0295'; // luke-sandbox folder in HELIX01-01
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
    safeGetSecret('nd-repository'),
  ]);

  const tokenUrl = authUrl || tokenUrlFallback;
  if (!tokenUrl) throw new Error('NetDocuments OAuth credentials are missing.');
  if (!basicKey && (!serviceClientId || !serviceClientSecret)) throw new Error('NetDocuments credentials are missing.');
  if (/\/neWeb2/i.test(tokenUrl) || !/\/oauth/i.test(tokenUrl)) {
    throw new Error(
      `NetDocuments token URL must be the API OAuth endpoint (e.g. https://api.eu.netdocuments.com/v1/OAuth). Current value: ${tokenUrl}`
    );
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  let tokenBasic = '';
  if (serviceClientId && serviceClientSecret) {
    const finalClientId = repository && !serviceClientId.includes('|') ? `${serviceClientId}|${repository}` : serviceClientId;
    tokenBasic = Buffer.from(`${finalClientId}:${serviceClientSecret}`).toString('base64');
  } else if (basicKey) {
    const trimmedBasic = String(basicKey).replace(/^Basic\s+/i, '').trim();
    tokenBasic = trimmedBasic.includes(':') ? Buffer.from(trimmedBasic).toString('base64') : trimmedBasic;
  }
  if (tokenBasic) {
    headers.Authorization = `Basic ${tokenBasic}`;
  }

  const bodyStr = `grant_type=client_credentials&scope=${scope || 'datatables_full full'}`;
  headers['Content-Length'] = Buffer.byteLength(bodyStr);

  const tokenData = await new Promise((resolve, reject) => {
    const urlObj = new URL(tokenUrl);
    const request = https.request(
      {
        hostname: urlObj.hostname,
        path: `${urlObj.pathname}${urlObj.search || ''}`,
        method: 'POST',
        headers,
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`Failed to obtain NetDocuments access token: ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse NetDocuments token response: ${data}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('NetDocuments token request timed out'));
    });
    request.write(bodyStr);
    request.end();
  });
  const accessToken = tokenData.access_token || tokenData.token;

  if (!accessToken) throw new Error('NetDocuments access token missing from response.');

  netDocumentsTokenCache = { token: accessToken, exp: now + (tokenData.expires_in || 3600) };
  return accessToken;
}

function safeParseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getAppBaseUrl() {
  const explicitBase = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (explicitBase) return explicitBase.replace(/\/$/, '');

  const port = process.env.PORT || 8080;
  const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
  if (isNamedPipe && process.env.WEBSITE_HOSTNAME) {
    return `https://${process.env.WEBSITE_HOSTNAME}`;
  }

  return `http://localhost:${port}`;
}

function normalizeInternalHelixEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.endsWith('@helix-law.com')) return null;
  return email;
}

function uniqueEmails(values) {
  const seen = new Set();
  return values.filter((value) => {
    const email = String(value || '').trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

async function resolveDemoNdWorkspace() {
  const port = process.env.PORT || 8080;
  const isNamedPipe = typeof port === 'string' && port.startsWith('\\.\\pipe\\');
  const base = isNamedPipe && process.env.WEBSITE_HOSTNAME
    ? `https://${process.env.WEBSITE_HOSTNAME}`
    : `http://localhost:${port}`;
  const response = await fetch(`${base}/api/resources/core/netdocuments-workspace?q=${encodeURIComponent(DEMO_ND_WORKSPACE_REF)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.result?.id) {
    throw new Error(payload?.error || `Unable to resolve NetDocuments demo workspace ${DEMO_ND_WORKSPACE_REF}.`);
  }
  return {
    workspaceId: String(payload.result.id),
    workspaceName: String(payload.result.name || 'HELIX01-01 demo workspace'),
  };
}

async function prepareCclDocx({ matterId, matterDisplayNumber, fileName, fields: liveFields }) {
  const docxName = fileName || `CCL-${matterDisplayNumber || matterId || 'draft'}.docx`;
  const docxPath = path.join(CCL_DIR, `${matterId || matterDisplayNumber || 'draft'}.docx`);
  const jsonFilePath = path.join(CCL_DIR, `${matterId || matterDisplayNumber || 'draft'}.json`);

  // Also check the generation output directory (logs/ccl-outputs/) as fallback
  const altDocxPath = path.join(CCL_OUTPUT_DIR, `${matterId || matterDisplayNumber || 'draft'}.docx`);
  const altJsonPath = path.join(CCL_OUTPUT_DIR, `${matterId || matterDisplayNumber || 'draft'}.json`);

  let draftJson = null;
  if (liveFields && typeof liveFields === 'object' && Object.keys(liveFields).length > 0) {
    const diskJson = fs.existsSync(jsonFilePath) ? JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'))
      : fs.existsSync(altJsonPath) ? JSON.parse(fs.readFileSync(altJsonPath, 'utf-8'))
      : {};
    draftJson = { ...diskJson, ...liveFields };
  } else if (fs.existsSync(jsonFilePath)) {
    draftJson = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
  } else if (fs.existsSync(altJsonPath)) {
    draftJson = JSON.parse(fs.readFileSync(altJsonPath, 'utf-8'));
  }

  if (draftJson) {
    const generationMeta = await generateWordFromJson(draftJson, docxPath);
    const unresolvedPlaceholders = generationMeta?.unresolvedPlaceholders || [];
    fs.writeFileSync(jsonFilePath, JSON.stringify(draftJson, null, 2));
    if (unresolvedPlaceholders.length > 0) {
      return {
        ok: false,
        docxName,
        docxPath,
        unresolvedPlaceholders,
        unresolvedCount: unresolvedPlaceholders.length,
      };
    }
  }

  if (!fs.existsSync(docxPath)) {
    // Fall back to generation output directory
    if (fs.existsSync(altDocxPath)) {
      return { ok: true, docxName, docxPath: altDocxPath };
    }
    throw new Error('Document not found. Generate the .docx first.');
  }

  return { ok: true, docxName, docxPath };
}

function buildNdMultipartBody({ workspaceId, fileName, fileBuffer, cabinet }) {
  const boundary = `----HelixCclBoundary${Date.now().toString(16)}`;
  const chunks = [];
  const appendField = (name, value) => {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  };

  appendField('id', workspaceId);
  appendField('name', path.parse(fileName).name);
  appendField('extension', path.extname(fileName).replace(/^\./, '') || 'docx');
  if (cabinet) appendField('cabinet', cabinet);
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`));
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return { boundary, body: Buffer.concat(chunks) };
}

async function uploadDocumentToNetDocuments({ workspaceId, fileName, fileBuffer }) {
  const [baseUrl, cabinet, accessToken] = await Promise.all([
    safeGetSecret('nd-baseurl'),
    safeGetSecret('nd-cabinet'),
    getNetDocumentsAccessToken(),
  ]);
  if (!baseUrl) throw new Error('NetDocuments base URL missing.');

  const { boundary, body } = buildNdMultipartBody({ workspaceId, fileName, fileBuffer, cabinet });
  const urlObj = new URL(`${String(baseUrl).replace(/\/$/, '')}/v2/content/upload-document`);

  return await new Promise((resolve, reject) => {
    const request = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(data || `NetDocuments upload failed (${response.statusCode}).`));
          return;
        }
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(20000, () => {
      request.destroy();
      reject(new Error('NetDocuments upload timed out.'));
    });
    request.write(body);
    request.end();
  });
}

function parseCandidateDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const ukMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const day = Number(ukMatch[1]);
    const month = Number(ukMatch[2]);
    const year = Number(ukMatch[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  return null;
}

function getPitchExpiry(versionRow, fields) {
  const explicitExpiry = [
    fields?.pitch_expiry,
    fields?.pitchExpiry,
    fields?.insert_pitch_expiry,
    fields?.insert_pitch_expiry_date,
    fields?.insert_quote_expiry,
    fields?.insert_quote_expiry_date,
  ].find((v) => typeof v === 'string' && v.trim());

  const explicitDate = parseCandidateDate(explicitExpiry || null);
  if (explicitDate) {
    return {
      source: 'fields',
      expiresAt: explicitDate.toISOString(),
    };
  }

  const base = versionRow?.FinalizedAt || versionRow?.CreatedAt;
  const baseDate = parseCandidateDate(base ? String(base) : null);
  if (!baseDate) return { source: 'none', expiresAt: null };

  const inferred = new Date(baseDate.getTime());
  inferred.setUTCDate(inferred.getUTCDate() + 30);
  return {
    source: 'inferred_30d',
    expiresAt: inferred.toISOString(),
  };
}

// ─── CCL Support Ticket ───────────────────────────────────────────────────────
// Adapts the TechProblemForm pattern for CCL-specific issues.
// Stores in tech_problems table and creates an Asana task, just like the Hub bug reporter.

router.post('/report', async (req, res) => {
  const {
    matterId,
    matterDisplayNumber,
    category,        // 'field_wrong' | 'ai_quality' | 'template_error' | 'upload_failed' | 'other'
    summary,
    description,
    urgency,         // 'Blocking' | 'Annoying' | 'Minor'
    submittedBy,     // user initials
    // Debug context — captured automatically from CCL state
    fieldSnapshot,   // Record<string, string> — current field values
    aiStatus,        // 'complete' | 'partial' | 'error' | 'idle'
    aiSource,
    aiDurationMs,
    dataSources,     // string[]
    fallbackReason,
    trackingId,
  } = req.body;

  if (!summary?.trim()) {
    return res.status(400).json({ ok: false, error: 'Summary is required.' });
  }

  try {
    // Build rich description for Asana task
    const debugLines = [
      `**Matter:** ${matterDisplayNumber || matterId || 'unknown'}`,
      `**Category:** ${category || 'general'}`,
      `**AI Status:** ${aiStatus || 'unknown'} (source: ${aiSource || 'n/a'})`,
      aiDurationMs ? `**AI Duration:** ${(aiDurationMs / 1000).toFixed(1)}s` : null,
      dataSources?.length ? `**Data Sources:** ${dataSources.join(', ')}` : null,
      fallbackReason ? `**Fallback Reason:** ${fallbackReason}` : null,
      trackingId ? `**Tracking ID:** ${trackingId}` : null,
      '',
      description ? `**Description:**\n${description}` : null,
    ].filter(Boolean).join('\n');

    // Count filled vs empty fields for context
    const fieldCount = fieldSnapshot ? Object.keys(fieldSnapshot).length : 0;
    const filledCount = fieldSnapshot ? Object.values(fieldSnapshot).filter(v => v?.trim()).length : 0;

    // Forward to existing tech-tickets endpoint for consistent handling
    const port = process.env.PORT || 8080;
    const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
    const base = isNamedPipe && process.env.WEBSITE_HOSTNAME
      ? `https://${process.env.WEBSITE_HOSTNAME}`
      : `http://localhost:${port}`;

    const ticketResp = await fetch(`${base}/api/tech-tickets/problem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'CCL',
        summary: `[CCL] ${summary}`,
        stepsToReproduce: debugLines,
        expectedVsActual: `Fields: ${filledCount}/${fieldCount} filled. Category: ${category || 'general'}.`,
        urgency: urgency || 'Annoying',
        submittedBy: submittedBy || '',
      }),
    });

    if (!ticketResp.ok) {
      const err = await ticketResp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create support ticket');
    }

    const ticketResult = await ticketResp.json();

    trackEvent('CCL.SupportTicket.Created', {
      matterId: matterDisplayNumber || matterId || 'unknown',
      category: category || 'general',
      urgency: urgency || 'Annoying',
      aiStatus: aiStatus || 'unknown',
      submittedBy: submittedBy || '',
    });


    return res.json({
      ok: true,
      message: 'Support ticket created. The development team has been notified.',
      ticketId: ticketResult.id || null,
    });
  } catch (error) {
    trackException(error, { operation: 'CCL.SupportTicket.Create', matterId: matterDisplayNumber || matterId });
    return res.status(500).json({ ok: false, error: error.message || 'Failed to submit support ticket' });
  }
});


// ─── Integration Availability Check ──────────────────────────────────────────
// Returns which integrations are available for a matter (Clio matter found, ND workspace found).
// Used by the UI to show/hide/enable upload buttons.

router.get('/integrations', async (req, res) => {
  const matterId = String(req.query.matterId || '').trim();
  if (!matterId) {
    return res.status(400).json({ ok: false, error: 'Missing matterId.' });
  }

  const result = { clio: { available: false, matterId: null, description: '' }, nd: { available: false, workspaceId: null, workspaceName: '' } };

  try {
    // Check Clio matter
    const port = process.env.PORT || 8080;
    const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
    const base = isNamedPipe && process.env.WEBSITE_HOSTNAME
      ? `https://${process.env.WEBSITE_HOSTNAME}`
      : `http://localhost:${port}`;

    const clioResp = await fetch(`${base}/api/resources/core/clio-matter?q=${encodeURIComponent(matterId)}`).catch(() => null);
    if (clioResp?.ok) {
      const clioData = await clioResp.json();
      const match = (clioData.results || []).find(r => r.displayNumber === matterId);
      if (match) {
        result.clio = { available: true, matterId: match.id, description: match.description || '' };
      }
    }
  } catch (e) {
    // Clio check failed — not fatal, just unavailable
  }

  try {
    // Check ND workspace — extract client ID and matter key from display number
    // Format: HLX-XXXXX-YYYYY → clientId = XXXXX, matterKey = YYYYY
    const match = matterId.match(/^HLX-(\d+)-(\d+)$/i);
    if (match) {
      const port = process.env.PORT || 8080;
      const isNamedPipe = typeof port === 'string' && port.startsWith('\\\\.\\pipe\\');
      const base = isNamedPipe && process.env.WEBSITE_HOSTNAME
        ? `https://${process.env.WEBSITE_HOSTNAME}`
        : `http://localhost:${port}`;

      const ndResp = await fetch(`${base}/api/resources/core/netdocuments-workspace?q=${encodeURIComponent(matterId)}`).catch(() => null);
      if (ndResp?.ok) {
        const ndData = await ndResp.json();
        if (ndData.ok && ndData.result) {
          result.nd = {
            available: true,
            workspaceId: ndData.result.id || ndData.result.envId || null,
            workspaceName: ndData.result.name || ndData.result.workspaceName || '',
          };
        }
      }
    }
  } catch (e) {
    // ND check failed — not fatal
  }

  return res.json({ ok: true, ...result });
});


// ─── Reconstruct historical version for preview ────────────────────────────
// Rebuilds a .docx from the exact FieldsJson snapshot in CclContent.
// This supports one-click sent-letter verification in Ops.

router.post('/reconstruct-version', async (req, res) => {
  const { cclContentId } = req.body || {};
  const started = Date.now();

  if (!Number.isFinite(Number(cclContentId))) {
    return res.status(400).json({ ok: false, error: 'cclContentId is required.' });
  }

  try {
    const versionRow = await getCclContentById(Number(cclContentId));
    if (!versionRow) {
      return res.status(404).json({ ok: false, error: 'Version snapshot not found.' });
    }

    const fields = versionRow.FieldsJson ? JSON.parse(versionRow.FieldsJson) : {};
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ ok: false, error: 'Snapshot has no field payload to reconstruct.' });
    }

    fs.mkdirSync(CCL_DIR, { recursive: true });
    const safeMatterId = String(versionRow.MatterId || 'matter').replace(/[^a-zA-Z0-9\-_]/g, '_');
    const fileName = `${safeMatterId}-v${versionRow.Version || 'x'}-reconstructed.docx`;
    const outPath = path.join(CCL_DIR, fileName);

    trackEvent('CCL.Reconstruct.Started', {
      matterId: String(versionRow.MatterId || ''),
      cclContentId: String(versionRow.CclContentId || ''),
      version: String(versionRow.Version || ''),
    });

    await generateWordFromJson(fields, outPath);

    const { expiresAt, source } = getPitchExpiry(versionRow, fields);
    const durationMs = Date.now() - started;

    trackEvent('CCL.Reconstruct.Completed', {
      matterId: String(versionRow.MatterId || ''),
      cclContentId: String(versionRow.CclContentId || ''),
      version: String(versionRow.Version || ''),
      expirySource: source,
      durationMs: String(durationMs),
    });
    trackMetric('CCL.Reconstruct.Duration', durationMs, {
      matterId: String(versionRow.MatterId || ''),
    });

    return res.json({
      ok: true,
      url: `/ccls/${fileName}`,
      fileName,
      version: versionRow.Version,
      cclContentId: versionRow.CclContentId,
      matterId: versionRow.MatterId,
      sent: {
        uploadedToClio: Boolean(versionRow.UploadedToClio),
        uploadedToNd: Boolean(versionRow.UploadedToNd),
        clioDocId: versionRow.ClioDocId || null,
        ndDocId: versionRow.NdDocId || null,
        finalizedAt: versionRow.FinalizedAt || null,
        finalizedBy: versionRow.FinalizedBy || null,
      },
      expiry: {
        expiresAt,
        source,
        isExpired: expiresAt ? new Date(expiresAt).getTime() < Date.now() : null,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - started;
    trackException(error, {
      operation: 'CCL.Reconstruct',
      cclContentId: String(cclContentId || ''),
    });
    trackEvent('CCL.Reconstruct.Failed', {
      cclContentId: String(cclContentId || ''),
      error: error.message,
      durationMs: String(durationMs),
    });
    return res.status(500).json({ ok: false, error: error.message || 'Failed to reconstruct CCL version.' });
  }
});


// ─── Clio Document Upload (3-step presigned URL) ─────────────────────────────
// Step 1: POST /documents → create record, get presigned put_url + headers
// Step 2: PUT binary to the S3 put_url with returned headers
// Step 3: PATCH /documents/{id} → confirm upload with uuid + fully_uploaded: true

router.post('/upload-clio', async (req, res) => {
  const { matterId, matterDisplayNumber, clioMatterId, fileName, initials: bodyInitials, fields: liveFields } = req.body;
  const startMs = Date.now();

  // Resolve user initials: prefer middleware (req.user), then request body, then null (→ service account fallback)
  const userInitials = req.user?.initials || bodyInitials || null;

  console.log('[CCL Upload Clio] Request received:', { matterId, matterDisplayNumber, clioMatterId, fileName, userInitials, hasLiveFields: !!liveFields });

  if (!clioMatterId) {
    return res.status(400).json({ ok: false, error: 'Clio matter ID is required. Run integration check first.' });
  }

  const docxName = fileName || `CCL-${matterDisplayNumber || matterId || 'draft'}.docx`;
  const docxPath = path.join(CCL_DIR, `${matterId || matterDisplayNumber || 'draft'}.docx`);
  const jsonFilePath = path.join(CCL_DIR, `${matterId || matterDisplayNumber || 'draft'}.json`);

  // Regenerate docx from live field values (sent by client) or latest disk JSON.
  // This ensures the uploaded document always matches what the user sees on screen.
  let regenSource = 'none';
  try {
    let draftJson = null;
    if (liveFields && typeof liveFields === 'object' && Object.keys(liveFields).length > 0) {
      // Prefer live fields from the editor — merge with disk JSON for any fields the client doesn't track
      const diskJson = fs.existsSync(jsonFilePath) ? JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8')) : {};
      draftJson = { ...diskJson, ...liveFields };
      regenSource = 'live';
    } else if (fs.existsSync(jsonFilePath)) {
      draftJson = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
      regenSource = 'disk';
    }
    if (draftJson) {
      console.log('[CCL Upload Clio] Regenerating docx from', regenSource, 'fields before upload...');
      const generationMeta = await generateWordFromJson(draftJson, docxPath);
      const unresolvedPlaceholders = generationMeta?.unresolvedPlaceholders || [];
      // Also persist the merged JSON so disk stays in sync
      fs.writeFileSync(jsonFilePath, JSON.stringify(draftJson, null, 2));
      console.log('[CCL Upload Clio] Docx regenerated successfully from', regenSource, 'fields.');

      if (unresolvedPlaceholders.length > 0) {
        trackEvent('CCL.Upload.Clio.BlockedUnresolvedPlaceholders', {
          matterId: matterDisplayNumber || matterId,
          unresolvedCount: String(unresolvedPlaceholders.length),
          unresolvedFields: unresolvedPlaceholders.join(', '),
        });
        return res.status(400).json({
          ok: false,
          error: 'Cannot upload yet: unresolved fields remain in the Client Care Letter.',
          unresolvedPlaceholders,
          unresolvedCount: unresolvedPlaceholders.length,
        });
      }
    }
  } catch (regenErr) {
    console.warn('[CCL Upload Clio] Docx regeneration failed, will upload existing file if available:', regenErr.message);
  }

  console.log('[CCL Upload Clio] Resolved docxPath:', docxPath, '| exists:', fs.existsSync(docxPath));

  if (!fs.existsSync(docxPath)) {
    return res.status(404).json({ ok: false, error: 'Document not found. Generate the .docx first.' });
  }

  try {
    // Use per-user credentials for audit trail; falls back to service account if not provisioned
    console.log('[CCL Upload Clio] Getting Clio access token for:', userInitials || 'service account');
    const accessToken = await getClioAccessToken(userInitials);
    console.log('[CCL Upload Clio] Token acquired, reading file...');
    const fileBuffer = fs.readFileSync(docxPath);
    console.log('[CCL Upload Clio] File read OK, size:', fileBuffer.length, 'bytes. Starting Step 1...');

    trackEvent('CCL.Upload.Clio.Started', {
      matterId: matterDisplayNumber || matterId,
      clioMatterId: String(clioMatterId),
      fileSizeBytes: String(fileBuffer.length),
      uploadedBy: userInitials || 'service',
    });

    // Step 1: Create document record in Clio → get presigned upload URL
    const createResp = await fetch(
      `${CLIO_API_BASE}/documents.json?fields=id,latest_document_version{uuid,put_url,put_headers}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: docxName,
            parent: {
              id: Number(clioMatterId),
              type: 'Matter',
            },
          },
        }),
      }
    );

    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error(`Clio document create failed (${createResp.status}): ${errText}`);
    }

    const createData = await createResp.json();
    const docId = createData.data?.id;
    const docVersion = createData.data?.latest_document_version;
    const putUrl = docVersion?.put_url;
    const putHeaders = docVersion?.put_headers || [];
    const uuid = docVersion?.uuid;

    if (!docId || !putUrl || !uuid) {
      throw new Error('Clio returned document but missing put_url or uuid');
    }

    console.log('[CCL Upload Clio] Step 1 complete. docId:', docId, 'uuid:', uuid);
    console.log('[CCL Upload Clio] Starting Step 2: PUT to S3...');

    // Step 2: PUT the binary file to the presigned S3 URL
    const uploadHeaders = {};
    for (const h of putHeaders) {
      if (h.name && h.value) {
        uploadHeaders[h.name] = h.value;
      }
    }
    // Ensure content type is set for .docx
    if (!uploadHeaders['Content-Type']) {
      uploadHeaders['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const putResp = await fetch(putUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: fileBuffer,
    });

    if (!putResp.ok) {
      const putErr = await putResp.text();
      throw new Error(`S3 upload failed (${putResp.status}): ${putErr}`);
    }

    console.log('[CCL Upload Clio] Step 2 complete. S3 upload OK.');
    console.log('[CCL Upload Clio] Starting Step 3: Confirm upload...');

    // Step 3: Confirm upload to Clio
    const confirmResp = await fetch(
      `${CLIO_API_BASE}/documents/${docId}.json?fields=id,latest_document_version{fully_uploaded}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            uuid: uuid,
            fully_uploaded: true,
          },
        }),
      }
    );

    if (!confirmResp.ok) {
      const confirmErr = await confirmResp.text();
      throw new Error(`Clio upload confirmation failed (${confirmResp.status}): ${confirmErr}`);
    }

    const confirmData = await confirmResp.json();
    const durationMs = Date.now() - startMs;

    console.log('[CCL Upload Clio] Step 3 complete. All 3 steps succeeded in', durationMs, 'ms. Clio doc ID:', docId);

    trackEvent('CCL.Upload.Clio.Completed', {
      matterId: matterDisplayNumber || matterId,
      clioMatterId: String(clioMatterId),
      clioDocumentId: String(docId),
      durationMs: String(durationMs),
      fileSizeBytes: String(fileBuffer.length),
    });
    trackMetric('CCL.Upload.Clio.Duration', durationMs, { matterId: matterDisplayNumber || matterId });

    return res.json({
      ok: true,
      message: `Document uploaded to Clio matter successfully.`,
      clioDocumentId: docId,
      fullyUploaded: confirmData.data?.latest_document_version?.fully_uploaded ?? true,
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error('[CCL Upload Clio] FAILED after', durationMs, 'ms:', error.message);
    trackException(error, { operation: 'CCL.Upload.Clio', matterId: matterDisplayNumber || matterId, clioMatterId: String(clioMatterId) });
    trackEvent('CCL.Upload.Clio.Failed', {
      matterId: matterDisplayNumber || matterId,
      clioMatterId: String(clioMatterId),
      error: error.message,
      durationMs: String(durationMs),
    });
    return res.status(500).json({ ok: false, error: error.message || 'Clio upload failed.' });
  }
});


// ─── NetDocuments Upload ─────────────────────────────────────────────────────
// Uploads the generated CCL .docx into the shared HELIX01-01 demo workspace.

router.post('/upload-nd', async (req, res) => {
  const { matterId, matterDisplayNumber, ndWorkspaceId: requestedWorkspaceId, fileName, fields: liveFields, triggeredBy: triggeredByRaw } = req.body;
  const startMs = Date.now();
  const uploadedBy = req.user?.initials || 'Hub';
  // Since 2026-04-27, ND upload is always an explicit solicitor click after
  // approval. The default tag captures that; callers (e.g. legacy chains) can
  // pass their own triggeredBy in the body if needed.
  const triggeredBy = String(triggeredByRaw || 'manual-after-approval');

  try {
    const prepared = await prepareCclDocx({
      matterId,
      matterDisplayNumber,
      fileName,
      fields: liveFields,
    });

    if (!prepared.ok) {
      return res.status(400).json({
        ok: false,
        error: 'Cannot upload yet: unresolved fields remain in the Client Care Letter.',
        unresolvedPlaceholders: prepared.unresolvedPlaceholders,
        unresolvedCount: prepared.unresolvedCount,
      });
    }

    const workspace = requestedWorkspaceId
      ? { workspaceId: String(requestedWorkspaceId), workspaceName: 'HELIX01-01 demo workspace' }
      : await resolveDemoNdWorkspace();
    const fileBuffer = fs.readFileSync(prepared.docxPath);

    trackEvent('CCL.Upload.ND.Started', {
      matterId: String(matterDisplayNumber || matterId || ''),
      targetWorkspace: workspace.workspaceName,
      targetWorkspaceId: workspace.workspaceId,
      fileName: prepared.docxName,
      fileSizeBytes: String(fileBuffer.length),
      uploadedBy,
      triggeredBy,
    });

    const ndPayload = await uploadDocumentToNetDocuments({
      workspaceId: CCL_ND_UPLOAD_FOLDER,
      fileName: prepared.docxName,
      fileBuffer,
    });
    const ndDocumentId = ndPayload?.standardAttributes?.id || ndPayload?.id || ndPayload?.documentId || null;

    const latestContent = matterId ? await getLatestCclContent(matterId) : null;
    if (latestContent?.CclContentId) {
      await markCclUploaded(latestContent.CclContentId, {
        nd: true,
        ndDocId: ndDocumentId ? String(ndDocumentId) : null,
        finalizedBy: uploadedBy,
      });
    }

    // 2026-04-24: auto-close any matching `review-ccl` hub_todo now that the
    // solicitor has explicitly approved and uploaded. Best-effort — telemetry
    // inside the helper; never throws.
    try {
      const { reconcileAllByRef } = require('../utils/hubTodoLog');
      const matterRef = matterDisplayNumber || String(matterId || '');
      if (matterRef) {
        await reconcileAllByRef({
          kind: 'review-ccl',
          matterRef,
          completedVia: 'ccl-ops.upload-nd',
          lastEvent: ndDocumentId ? `Uploaded · doc ${ndDocumentId}` : 'Uploaded',
        });
      }
    } catch (todoErr) {
      trackEvent('Todo.Card.Reconcile.Failed', {
        kind: 'review-ccl',
        matterId: String(matterId || ''),
        error: todoErr?.message || String(todoErr),
      });
    }

    const durationMs = Date.now() - startMs;
    trackEvent('CCL.Upload.ND.Completed', {
      matterId: String(matterDisplayNumber || matterId || ''),
      targetWorkspace: workspace.workspaceName,
      targetWorkspaceId: workspace.workspaceId,
      ndDocumentId: ndDocumentId ? String(ndDocumentId) : '',
      fileName: prepared.docxName,
      durationMs: String(durationMs),
      triggeredBy,
    });
    trackMetric('CCL.Upload.ND.Duration', durationMs, {
      matterId: String(matterDisplayNumber || matterId || ''),
    });

    return res.json({
      ok: true,
      ndDocumentId,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      fileName: prepared.docxName,
      docxPath: `/ccls/${path.basename(prepared.docxPath)}`,
      message: `Document uploaded to NetDocuments workspace ${workspace.workspaceName}.`,
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    trackException(error, { operation: 'CCL.Upload.ND', matterId: matterDisplayNumber || matterId });
    trackEvent('CCL.Upload.ND.Failed', {
      matterId: String(matterDisplayNumber || matterId || ''),
      error: error.message,
      durationMs: String(durationMs),
      triggeredBy,
    });
    return res.status(500).json({ ok: false, error: error.message || 'NetDocuments upload failed.' });
  }
});

router.post('/mark-sent', async (req, res) => {
  const { matterId, cclContentId, sentAt, channel } = req.body || {};
  const startMs = Date.now();
  const actor = resolveRequestActor(req);
  const sentBy = actor && actor !== 'unknown' ? actor : 'Hub';

  if (!matterId && !cclContentId) {
    return res.status(400).json({ ok: false, error: 'matterId or cclContentId is required' });
  }

  try {
    const latestContent = cclContentId
      ? await getCclContentById(Number(cclContentId))
      : await getLatestCclContent(String(matterId));

    if (!latestContent?.CclContentId) {
      return res.status(404).json({ ok: false, error: 'No CCL content found for mark-sent' });
    }

    const normalizedSentAt = sentAt ? new Date(sentAt) : new Date();
    if (Number.isNaN(normalizedSentAt.getTime())) {
      return res.status(400).json({ ok: false, error: 'Invalid sentAt value' });
    }

    const sendChannel = String(channel || 'manual').trim() || 'manual';
    const matterRef = String(latestContent.MatterId || matterId || '');
    const provenance = safeParseJson(latestContent.ProvenanceJson, {});

    trackEvent('CCL.Sent.Started', {
      matterId: matterRef,
      cclContentId: String(latestContent.CclContentId),
      triggeredBy: sentBy,
      channel: sendChannel,
    });

    const sentId = await saveCclSent({
      cclContentId: latestContent.CclContentId,
      sentBy,
      sentAt: normalizedSentAt,
      channel: sendChannel,
    });
    if (!sentId) {
      throw new Error('Failed to persist sent row');
    }
    await updateCclStatus(matterRef, 'sent', { actor: sentBy }).catch(() => null);

    const durationMs = Date.now() - startMs;
    trackEvent('CCL.Sent.Recorded', {
      matterId: matterRef,
      cclContentId: String(latestContent.CclContentId),
      sentId: String(sentId || ''),
      sentBy,
      channel: sendChannel,
      promptVersion: String(provenance?.promptVersion || provenance?.ai?.promptVersion || ''),
      templateVersion: String(latestContent.TemplateVersion || provenance?.templateVersion || ''),
      durationMs: String(durationMs),
    });
    trackMetric('CCL.Sent.Duration', durationMs, { matterId: matterRef, channel: sendChannel });

    return res.json({
      ok: true,
      sentId,
      cclContentId: latestContent.CclContentId,
      matterId: matterRef,
      sentAt: normalizedSentAt.toISOString(),
      sentBy,
      channel: sendChannel,
      sentChannel: sendChannel,
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    trackException(error, { operation: 'CCL.Sent', matterId: String(matterId || ''), cclContentId: String(cclContentId || '') });
    trackEvent('CCL.Sent.Failed', {
      matterId: String(matterId || ''),
      cclContentId: String(cclContentId || ''),
      sentBy,
      durationMs: String(durationMs),
      error: error.message,
    });
    return res.status(500).json({ ok: false, error: 'Failed to record sent event' });
  }
});

router.post('/send-to-client', async (req, res) => {
  const { matterId, cclContentId } = req.body || {};
  const startMs = Date.now();
  const actor = resolveRequestActor(req);
  const sentBy = actor && actor !== 'unknown' ? actor : 'Hub';

  if (!matterId && !cclContentId) {
    return res.status(400).json({ ok: false, error: 'matterId or cclContentId is required' });
  }

  try {
    const latestContent = cclContentId
      ? await getCclContentById(Number(cclContentId))
      : await getLatestCclContent(String(matterId));

    if (!latestContent?.CclContentId) {
      return res.status(404).json({ ok: false, error: 'No CCL content found for guarded send' });
    }

    const fields = safeParseJson(latestContent.FieldsJson, {}) || {};
    const matterRef = String(latestContent.MatterId || matterId || '').trim();
    const matterDisplayNumber = String(fields.matter || matterRef || '').trim() || matterRef;
    const clientName = String(latestContent.ClientName || fields.insert_clients_name || 'Client').trim() || 'Client';
    const feeEarnerName = String(latestContent.FeeEarner || fields.name_of_person_handling_matter || 'Fee earner').trim() || 'Fee earner';
    const feeEarnerEmail = normalizeInternalHelixEmail(latestContent.FeeEarnerEmail || fields.fee_earner_email || '');

    if (!feeEarnerEmail) {
      return res.status(409).json({ ok: false, error: 'Fee earner internal email is required before guarded send can run' });
    }

    const toRecipients = ['lz@helix-law.com'];
    const ccRecipients = uniqueEmails([feeEarnerEmail, 'ac@helix-law.com']).filter((email) => !toRecipients.includes(email));
    const clientEmail = String(latestContent.ClientEmail || fields.client_email || '').trim();
    const baseUrl = getAppBaseUrl();
    const reviewUrl = `${baseUrl}/?tab=operations&cclMatter=${encodeURIComponent(matterRef)}&autoReview=1`;
    const documentUrl = `${baseUrl}/ccls/${encodeURIComponent(matterRef)}.docx`;
    const subject = `[Internal only] CCL ready for ${matterDisplayNumber}`;
    const bodyHtml = `
      <div data-no-signature="true">
        <p><strong>Internal only:</strong> this send path is hard-guarded and the client was not emailed.</p>
        <p>The CCL for <strong>${matterDisplayNumber}</strong> (${clientName}) is ready. Luke is the only To recipient while the send path is under guard. Alex and the fee earner are copied for confidence and supervision.</p>
        <ul>
          <li><strong>Matter:</strong> ${matterDisplayNumber}</li>
          <li><strong>Client:</strong> ${clientName}</li>
          <li><strong>Fee earner:</strong> ${feeEarnerName} (${feeEarnerEmail})</li>
          <li><strong>Uploaded to NetDocuments:</strong> ${latestContent.UploadedToNd ? 'Yes' : 'Not yet'}</li>
        </ul>
        <p><a href="${reviewUrl}" target="_blank" rel="noopener noreferrer">Open CCL review</a></p>
        <p><a href="${documentUrl}" target="_blank" rel="noopener noreferrer">Open generated DOCX</a></p>
        <p>When the client send path is enabled later, the client address will move into <strong>To:</strong> and the fee earner will remain copied.</p>
      </div>
    `;

    trackEvent('CCL.SendToClient.Guarded.Started', {
      matterId: matterRef,
      cclContentId: String(latestContent.CclContentId),
      triggeredBy: sentBy,
      toCount: String(toRecipients.length),
      ccCount: String(ccRecipients.length),
      clientExcluded: clientEmail ? 'true' : 'false',
    });

    const emailResult = await sendHelixEmail({
      req,
      route: 'server:/api/ccl-ops/send-to-client',
      body: {
        user_email: toRecipients.join(';'),
        cc_emails: ccRecipients.join(';'),
        subject,
        email_contents: bodyHtml,
        from_email: 'automations@helix-law.com',
        skip_signature: true,
        matterRef,
        instructionRef: latestContent.InstructionRef || null,
        contextLabel: 'CCL guarded internal send',
        template_name: 'ccl-guarded-internal-send',
        source: 'ccl-guarded-send',
      },
    });

    if (!emailResult.ok) {
      throw new Error(emailResult.error || `Guarded send failed (${emailResult.status || 500})`);
    }

    const normalizedSentAt = new Date();
    const sentId = await saveCclSent({
      cclContentId: latestContent.CclContentId,
      sentBy,
      sentAt: normalizedSentAt,
      channel: 'internal-guarded',
    });
    if (!sentId) {
      throw new Error('Failed to persist guarded sent row');
    }

    await updateCclStatus(matterRef, 'sent', { actor: sentBy }).catch(() => null);

    const durationMs = Date.now() - startMs;
    trackEvent('CCL.SendToClient.Guarded.Completed', {
      matterId: matterRef,
      cclContentId: String(latestContent.CclContentId),
      sentId: String(sentId),
      sentBy,
      toCount: String(toRecipients.length),
      ccCount: String(ccRecipients.length),
      clientExcluded: clientEmail ? 'true' : 'false',
      durationMs: String(durationMs),
    });
    trackMetric('CCL.SendToClient.Guarded.Duration', durationMs, { matterId: matterRef });

    return res.json({
      ok: true,
      sentId,
      cclContentId: latestContent.CclContentId,
      matterId: matterRef,
      sentAt: normalizedSentAt.toISOString(),
      sentBy,
      sentChannel: 'internal-guarded',
      recipients: {
        to: toRecipients,
        cc: ccRecipients,
      },
      guard: {
        clientExcluded: true,
        lockedTo: toRecipients,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    trackException(error, { operation: 'CCL.SendToClient.Guarded', matterId: String(matterId || ''), cclContentId: String(cclContentId || '') });
    trackEvent('CCL.SendToClient.Guarded.Failed', {
      matterId: String(matterId || ''),
      cclContentId: String(cclContentId || ''),
      sentBy,
      durationMs: String(durationMs),
      error: error.message,
    });
    return res.status(500).json({ ok: false, error: error.message || 'Guarded send failed' });
  }
});


// 2026-04-24: autoUploadCclToNetDocuments helper deleted. ND upload is now
// solicitor-initiated only, via POST /upload-nd above. No background / chain
// callers remain (see server/routes/ccl.js autopilot chain — ND stage is
// permanently 'awaiting-approval').

module.exports = router;
