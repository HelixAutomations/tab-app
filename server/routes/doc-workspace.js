const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { DefaultAzureCredential } = require('@azure/identity');
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} = require('@azure/storage-blob');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const STORAGE_ACCOUNT_NAME = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_NAME || 'instructionfiles';
const PROSPECT_CONTAINER = process.env.PROSPECT_FILES_CONTAINER || 'prospect-files';
const DOC_WORKSPACE_TTL_DAYS = 14;

// Multer: 20 MB, memory storage (streams to blob)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const blocked = /\.(exe|bat|cmd|sh|ps1|msi|dll|com|scr|vbs|js)$/i;
    if (blocked.test(file.originalname)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  },
});

// Allowed upload subfolder names. Anything not in this set is rejected.
const ALLOWED_SUBFOLDERS = new Set([
  'Evidence',
  'Holding',
  'Telephone Attendance Notes',
  'Common - Clio',
  'Common - Finance',
  'Common - Correspondence',
  'Common - Documents',
  'Incoming Post',
  'Adjudication',
  'Litigation',
  'Employment',
  'Possession Proceedings',
]);

let blobServiceClient = null;
let blobServiceClientMode = 'unknown';

function getAuthMode() {
  const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (connectionString) return 'connectionString';
  if (accountKey) return 'sharedKey';
  return 'aad';
}

function getSafeStorageEndpointDebug() {
  const mode = getAuthMode();
  if (mode === 'connectionString') {
    const cs = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const isDev = /UseDevelopmentStorage\s*=\s*true/i.test(cs);
    const blobEndpointMatch = cs.match(/BlobEndpoint\s*=\s*([^;]+)/i);
    let blobHost = null;
    if (blobEndpointMatch && blobEndpointMatch[1]) {
      try {
        blobHost = new URL(blobEndpointMatch[1]).host;
      } catch {
        blobHost = null;
      }
    }
    return { mode, isDev, blobHost };
  }

  return {
    mode,
    isDev: false,
    blobHost: `${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
  };
}

function shouldLog(_req) {
  // Always log in non-prod; in prod require explicit flag.
  const enabled = String(process.env.DOC_WORKSPACE_DEBUG_LOGS || '').trim().toLowerCase() === 'true';
  const nonProd = process.env.NODE_ENV !== 'production';
  return enabled || nonProd;
}

function safeLog(msg, data) {
  try {
    console.log(`[doc-workspace] ${msg}`, data);
  } catch {
    // ignore
  }
}

// Avoid 304s and stale debug bodies while iterating.
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function getBlobServiceClient() {
  if (blobServiceClient) return blobServiceClient;

  const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;

  if (connectionString) {
    blobServiceClientMode = 'connectionString';
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    return blobServiceClient;
  }

  if (accountKey) {
    blobServiceClientMode = 'sharedKey';
    const sharedKeyCredential = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
    blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential,
    );
    return blobServiceClient;
  }

  blobServiceClientMode = 'aad';
  const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
  blobServiceClient = new BlobServiceClient(
    `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    credential,
  );
  return blobServiceClient;
}

async function generateBlobReadSasUrl(containerName, blobName, filename, minutes = 60) {
  try {
    const svc = getBlobServiceClient();

    const now = new Date();
    const startsOn = new Date(now.valueOf() - 5 * 60 * 1000);
    const expiresOn = new Date(now.valueOf() + minutes * 60 * 1000);

    // Prefer AAD user delegation SAS when possible.
    try {
      const userDelegationKey = await svc.getUserDelegationKey(startsOn, expiresOn);
      const sas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn,
          expiresOn,
          contentDisposition: filename ? `inline; filename="${filename.replace(/\r|\n/g, ' ').replace(/"/g, "'")}"` : undefined,
        },
        userDelegationKey,
        STORAGE_ACCOUNT_NAME,
      ).toString();

      return `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
    } catch (e) {
      const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
      if (!accountKey) throw e;
      const sharedKeyCredential = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
      const sas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn,
          expiresOn,
          contentDisposition: filename ? `inline; filename="${filename.replace(/\r|\n/g, ' ').replace(/"/g, "'")}"` : undefined,
        },
        sharedKeyCredential,
      ).toString();
      return `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
    }
  } catch {
    return null;
  }
}

function parseEnquiryId(req, res) {
  const raw = req.query?.enquiry_id;
  if (!raw) {
    res.status(400).json({ error: 'Missing enquiry_id' });
    return null;
  }
  const enquiryId = Number.parseInt(String(raw), 10);
  if (Number.isNaN(enquiryId)) {
    res.status(400).json({ error: 'Invalid enquiry_id - must be a number' });
    return null;
  }
  return enquiryId;
}

function safeIso(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function extractPasscodeFromPrefix(prefix, enquiryId) {
  const expected = `enquiries/${enquiryId}/`;
  if (!prefix || typeof prefix !== 'string') return null;
  if (!prefix.startsWith(expected)) return null;
  const rest = prefix.slice(expected.length);
  const passcode = rest.replace(/\/$/, '').split('/')[0];
  return passcode ? passcode : null;
}

async function getWorkspaceCreatedAt(containerClient, enquiryId, passcode) {
  const prefix = `enquiries/${enquiryId}/${passcode}/`;

  // Scan ALL blobs to find the earliest timestamp - this is when the workspace was created.
  // The oldest blob (whether marker or document) indicates when the workspace first existed.
  let earliest = null;
  let latest = null;
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    const lastModified = blob.properties?.lastModified;
    if (!lastModified) continue;

    if (!earliest || lastModified.getTime() < earliest.getTime()) earliest = lastModified;
    if (!latest || lastModified.getTime() > latest.getTime()) latest = lastModified;
  }

  if (!earliest && !latest) return null;
  return { earliest, latest };
}

async function getWorkspaceStats(containerClient, enquiryId, passcode) {
  const prefix = `enquiries/${enquiryId}/${passcode}/`;
  const markerNames = new Set([`${prefix}.keep`, `${prefix}Instructions.txt`]);

  let earliest = null;
  let latest = null;
  let nonMarkerCount = 0;

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (markerNames.has(blob.name)) continue;

    // Skip marker-like blobs even if stored in subfolders
    if (blob.name.endsWith('/.keep')) continue;
    if (blob.name.endsWith('/Instructions.txt')) continue;

    nonMarkerCount += 1;
    const lm = blob.properties?.lastModified;
    if (lm) {
      if (!earliest || lm.getTime() < earliest.getTime()) earliest = lm;
      if (!latest || lm.getTime() > latest.getTime()) latest = lm;
    }
    if (nonMarkerCount >= 250) break;
  }

  return { earliest, latest, nonMarkerCount };
}

async function resolveLatestWorkspace(containerClient, enquiryId) {
  const prefix = `enquiries/${enquiryId}/`;

  // Collect passcode prefixes under enquiries/{enquiryId}/
  const passcodes = [];
  for await (const item of containerClient.listBlobsByHierarchy('/', { prefix })) {
    if (item.kind !== 'prefix') continue;
    const passcode = extractPasscodeFromPrefix(item.name, enquiryId);
    if (passcode) passcodes.push(passcode);
  }

  if (passcodes.length === 0) return null;

  // Pick the most relevant workspace:
  // 1) Prefer passcodes that contain any non-marker blobs (documents)
  // 2) Then pick the most recently active among those.
  let best = null;
  for (const passcode of passcodes) {
    const stats = await getWorkspaceStats(containerClient, enquiryId, passcode);
    const docEarliest = stats?.earliest || null;
    const docLatest = stats?.latest || null;
    const nonMarkerCount = typeof stats?.nonMarkerCount === 'number' ? stats.nonMarkerCount : 0;

    // Get workspace creation time from marker files (separate from doc timestamps).
    const markerTimestamps = await getWorkspaceCreatedAt(containerClient, enquiryId, passcode);
    // Workspace createdAt = marker earliest (when workspace was created), NOT doc upload times.
    const workspaceCreatedAt = markerTimestamps?.earliest || docEarliest || null;

    safeLog('resolveLatestWorkspace iteration', {
      passcode,
      markerEarliest: markerTimestamps?.earliest ? safeIso(markerTimestamps.earliest) : null,
      docEarliest: docEarliest ? safeIso(docEarliest) : null,
      workspaceCreatedAt: workspaceCreatedAt ? safeIso(workspaceCreatedAt) : null,
    });

    const scoreMs = docLatest ? docLatest.getTime() : (workspaceCreatedAt ? workspaceCreatedAt.getTime() : Number.NEGATIVE_INFINITY);
    const hasDocs = nonMarkerCount > 0;

    if (!best) {
      best = { passcode, workspaceCreatedAt, docLatest, scoreMs, hasDocs, nonMarkerCount };
      continue;
    }

    // Prefer any workspace with docs over one without.
    if (hasDocs && !best.hasDocs) {
      best = { passcode, workspaceCreatedAt, docLatest, scoreMs, hasDocs, nonMarkerCount };
      continue;
    }
    if (!hasDocs && best.hasDocs) continue;

    if (scoreMs > best.scoreMs) {
      best = { passcode, workspaceCreatedAt, docLatest, scoreMs, hasDocs, nonMarkerCount };
    }
  }

  if (!best) return null;

  // Use workspace creation time for expiry calculation, not doc upload time.
  const createdAtDate = best.workspaceCreatedAt || new Date();
  const expiresAtDate = new Date(createdAtDate.getTime() + DOC_WORKSPACE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const expiresMs = expiresAtDate.getTime();

  return {
    passcode: best.passcode,
    createdAt: safeIso(createdAtDate),
    expiresAt: safeIso(expiresAtDate),
    isExpired: Number.isFinite(expiresMs) ? expiresMs <= Date.now() : false,
    urlPath: `/pitch/${best.passcode}`,
  };
}

async function listPasscodeDiagnostics(containerClient, enquiryId) {
  const prefix = `enquiries/${enquiryId}/`;
  const passcodes = [];

  for await (const item of containerClient.listBlobsByHierarchy('/', { prefix })) {
    if (item.kind !== 'prefix') continue;
    const passcode = extractPasscodeFromPrefix(item.name, enquiryId);
    if (!passcode) continue;

    const workspacePrefix = `enquiries/${enquiryId}/${passcode}/`;
    let blobCount = 0;
    let nonMarkerCount = 0;
    let latest = null;
    let earliest = null;

    for await (const blob of containerClient.listBlobsFlat({ prefix: workspacePrefix })) {
      blobCount += 1;
      if (!blob.name.endsWith('/.keep') && !blob.name.endsWith('/Instructions.txt')) {
        nonMarkerCount += 1;
      }
      const lm = blob.properties?.lastModified;
      if (lm) {
        if (!latest || lm.getTime() > latest.getTime()) latest = lm;
        if (!earliest || lm.getTime() < earliest.getTime()) earliest = lm;
      }
      if (blobCount >= 250) break;
    }

    passcodes.push({
      passcode,
      blobCount,
      nonMarkerCount,
      earliestModified: safeIso(earliest),
      latestModified: safeIso(latest),
    });
  }

  passcodes.sort((a, b) => {
    const am = a.latestModified ? new Date(a.latestModified).getTime() : 0;
    const bm = b.latestModified ? new Date(b.latestModified).getTime() : 0;
    return bm - am;
  });

  return passcodes;
}

// GET /api/doc-workspace/status?enquiry_id=123
router.get('/status', async (req, res) => {
  const enquiryId = parseEnquiryId(req, res);
  if (!enquiryId) return;

  const debug = String(req.query?.debug || '').trim() === '1';

  try {
    const svc = getBlobServiceClient();
    const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);

    safeLog('status request', {
      enquiryId,
      storageAccount: STORAGE_ACCOUNT_NAME,
      container: PROSPECT_CONTAINER,
      endpoint: getSafeStorageEndpointDebug(),
    });

    const workspace = await resolveLatestWorkspace(containerClient, enquiryId);
    if (!workspace) {
      if (!debug) return res.json({ exists: false, enquiryId });

      const passcodes = await listPasscodeDiagnostics(containerClient, enquiryId);

      safeLog('status not found', {
        enquiryId,
        passcodesCount: passcodes.length,
        passcodes: passcodes.slice(0, 10),
      });

      return res.json({
        exists: false,
        enquiryId,
        debug: {
          storageAccount: STORAGE_ACCOUNT_NAME,
          container: PROSPECT_CONTAINER,
          authMode: blobServiceClientMode || getAuthMode(),
          endpoint: getSafeStorageEndpointDebug(),
          passcodes,
        },
      });
    }

    const base = {
      exists: true,
      enquiryId,
      passcode: workspace.passcode,
      urlPath: workspace.urlPath,
      createdAt: workspace.createdAt,
      expiresAt: workspace.expiresAt,
      isExpired: workspace.isExpired,

    };

    if (!debug) return res.json(base);

    const passcodes = await listPasscodeDiagnostics(containerClient, enquiryId);

    safeLog('status found', {
      enquiryId,
      selectedPasscode: workspace.passcode,
      passcodesCount: passcodes.length,
      passcodes: passcodes.slice(0, 10),
    });

    return res.json({
      ...base,
      debug: {
        storageAccount: STORAGE_ACCOUNT_NAME,
        container: PROSPECT_CONTAINER,
        authMode: blobServiceClientMode || getAuthMode(),
        endpoint: getSafeStorageEndpointDebug(),
        passcodes,
      },
    });
  } catch (err) {
    // Do not leak secrets; include best-effort debug details only outside production.
    console.error('doc-workspace/status failed', {
      enquiryId,
      name: err?.name,
      message: err?.message,
    });

    const detail = process.env.NODE_ENV === 'production'
      ? undefined
      : (typeof err?.message === 'string' ? err.message : String(err));

    return res.status(500).json({
      error: 'Failed to check workspace status',
      detail,
      hint: 'Ensure the server has blob read access to the storage account/container (managed identity RBAC or INSTRUCTIONS_STORAGE_CONNECTION_STRING/INSTRUCTIONS_STORAGE_ACCOUNT_KEY).',
    });
  }
});

// GET /api/doc-workspace/documents?enquiry_id=123&passcode=abc123
router.get('/documents', async (req, res) => {
  const enquiryId = parseEnquiryId(req, res);
  if (!enquiryId) return;

  const debug = String(req.query?.debug || '').trim() === '1';

  try {
    const svc = getBlobServiceClient();
    const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);

    safeLog('documents request', {
      enquiryId,
      requestedPasscode: typeof req.query?.passcode === 'string' ? req.query.passcode : null,
      storageAccount: STORAGE_ACCOUNT_NAME,
      container: PROSPECT_CONTAINER,
      endpoint: getSafeStorageEndpointDebug(),
    });

    let passcode = String(req.query?.passcode || '').trim();
    if (!passcode) {
      const workspace = await resolveLatestWorkspace(containerClient, enquiryId);
      passcode = workspace?.passcode || '';
    }

    if (!passcode) {
      if (!debug) return res.json({ enquiryId, passcode: null, folders: [], documents: [] });
      const passcodes = await listPasscodeDiagnostics(containerClient, enquiryId);

      safeLog('documents no passcode resolved', {
        enquiryId,
        passcodesCount: passcodes.length,
        passcodes: passcodes.slice(0, 10),
      });

      return res.json({
        enquiryId,
        passcode: null,
        folders: [],
        documents: [],
        debug: {
          storageAccount: STORAGE_ACCOUNT_NAME,
          container: PROSPECT_CONTAINER,
          authMode: blobServiceClientMode || getAuthMode(),
          endpoint: getSafeStorageEndpointDebug(),
          passcodes,
        },
      });
    }

    const prefix = `enquiries/${enquiryId}/${passcode}/`;

    const documents = [];
    const foldersSet = new Set();
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const blobName = blob.name;

      // Track workspace folder structure from marker blobs and document blobs.
      const rel = blobName.startsWith(prefix) ? blobName.slice(prefix.length) : blobName;
      const relParts = String(rel || '').split('/').filter(Boolean);
      if (relParts.length > 1) {
        foldersSet.add(relParts[0]);
      }

      // Skip folder markers and instructions.
      if (rel === '.keep') continue;
      if (rel === 'Instructions.txt') continue;
      if (blobName.endsWith('/.keep')) continue;
      if (blobName.endsWith('/Instructions.txt')) continue;

      const filename = blobName.split('/').pop() || blobName;
      const blobClient = containerClient.getBlobClient(blobName);

      const sasUrl = await generateBlobReadSasUrl(PROSPECT_CONTAINER, blobName, filename, 60);
      const lastModified = blob.properties?.lastModified ? safeIso(blob.properties.lastModified) : null;
      const contentType = blob.properties?.contentType || null;
      const size = typeof blob.properties?.contentLength === 'number' ? blob.properties.contentLength : null;

      documents.push({
        id: blobName,
        blob_name: blobName,
        blob_url: sasUrl || blobClient.url,
        original_filename: filename,
        file_size: size,
        content_type: contentType,
        uploaded_at: lastModified,
        uploaded_by: 'Client',
        document_type: null,
        stage_uploaded: 'pitch',
        notes: null,
      });
    }

    const folders = Array.from(foldersSet)
      .filter((f) => typeof f === 'string' && f.trim())
      .sort((a, b) => String(a).localeCompare(String(b)));

    // Sort newest first when we have timestamps.
    documents.sort((a, b) => {
      const am = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
      const bm = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
      return bm - am;
    });

    safeLog('documents listed', {
      enquiryId,
      passcode,
      prefix,
      documentCount: documents.length,
    });

    if (!debug) return res.json({ enquiryId, passcode, folders, documents });

    return res.json({
      enquiryId,
      passcode,
      folders,
      documents,
      debug: {
        storageAccount: STORAGE_ACCOUNT_NAME,
        container: PROSPECT_CONTAINER,
        authMode: blobServiceClientMode || getAuthMode(),
        endpoint: getSafeStorageEndpointDebug(),
        prefix,
      },
    });
  } catch (err) {
    console.error('doc-workspace/documents failed', {
      enquiryId,
      passcode: typeof req.query?.passcode === 'string' ? req.query.passcode : undefined,
      name: err?.name,
      message: err?.message,
    });

    const maybeStatusCode = err?.statusCode || err?.details?.statusCode || err?.response?.status;
    const msg = typeof err?.message === 'string' ? err.message : '';
    const isAuthError =
      maybeStatusCode === 401 ||
      maybeStatusCode === 403 ||
      msg.includes('not authorized') ||
      msg.includes('not authorised') ||
      msg.includes('Authorization') ||
      msg.includes('permission');

    // If blob auth isn't configured (common in staging/early deployments), don't fail the UI.
    if (isAuthError) {
      return res.status(200).json({
        enquiryId,
        passcode: typeof req.query?.passcode === 'string' ? String(req.query.passcode).trim() : null,
        folders: [],
        documents: [],
        unauthorised: true,
        hint: 'Blob access not configured for doc workspace. Assign storage RBAC to the app identity or provide INSTRUCTIONS_STORAGE_CONNECTION_STRING/INSTRUCTIONS_STORAGE_ACCOUNT_KEY.',
      });
    }

    const detail = process.env.NODE_ENV === 'production'
      ? undefined
      : (typeof err?.message === 'string' ? err.message : String(err));

    return res.status(500).json({
      error: 'Failed to list workspace documents',
      detail,
      hint: 'Ensure the server has blob read access to the storage account/container (managed identity RBAC or INSTRUCTIONS_STORAGE_CONNECTION_STRING/INSTRUCTIONS_STORAGE_ACCOUNT_KEY).',
    });
  }
});

/**
 * GET /pending-actions
 * Returns a list of enquiries with files in Holding folder that need allocation.
 * Query params:
 * - enquiryIds: comma-separated list of enquiry IDs to check (optional, limits scope)
 */
router.get('/pending-actions', async (req, res) => {
  try {
    const svc = getBlobServiceClient();
    const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);

    // Parse optional enquiry IDs filter
    const enquiryIdsParam = String(req.query?.enquiryIds || '').trim();
    const filterIds = enquiryIdsParam ? enquiryIdsParam.split(',').map(id => id.trim()).filter(Boolean) : null;

    const pendingActions = [];
    const seenEnquiries = new Set();

    // List all blobs and find those in /Holding/ folders
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'enquiries/' })) {
      const blobName = blob.name;
      
      // Pattern: enquiries/{enquiryId}/{passcode}/Holding/{filename}
      const match = blobName.match(/^enquiries\/(\d+)\/([^/]+)\/Holding\/(.+)$/);
      if (!match) continue;

      const [, enquiryId, passcode, filename] = match;
      
      // Skip .folder marker files
      if (filename === '.folder') continue;
      
      // Filter by enquiry IDs if provided
      if (filterIds && !filterIds.includes(enquiryId)) continue;

      // Track unique enquiry+passcode combinations
      const key = `${enquiryId}:${passcode}`;
      if (seenEnquiries.has(key)) {
        // Increment count for existing entry
        const existing = pendingActions.find(a => a.enquiryId === enquiryId && a.passcode === passcode);
        if (existing) existing.holdingCount += 1;
        continue;
      }

      seenEnquiries.add(key);
      pendingActions.push({
        enquiryId,
        passcode,
        holdingCount: 1,
        actionType: 'allocate_documents',
        actionLabel: 'Files need allocation',
      });
    }

    return res.json({
      pendingActions,
      total: pendingActions.length,
      totalFiles: pendingActions.reduce((sum, a) => sum + a.holdingCount, 0),
    });
  } catch (err) {
    console.error('doc-workspace/pending-actions failed', {
      name: err?.name,
      message: err?.message,
    });

    const maybeStatusCode = err?.statusCode || err?.details?.statusCode || err?.response?.status;
    const msg = typeof err?.message === 'string' ? err.message : '';
    const isAuthError =
      maybeStatusCode === 401 ||
      maybeStatusCode === 403 ||
      msg.includes('not authorized') ||
      msg.includes('not authorised') ||
      msg.includes('Authorization') ||
      msg.includes('permission');

    // In local dev, blob access often isn’t configured. Don’t fail the whole page.
    if (isAuthError) {
      return res.status(200).json({
        pendingActions: [],
        total: 0,
        unauthorised: true,
      });
    }

    return res.status(500).json({
      error: 'Failed to check pending actions',
      pendingActions: [],
      total: 0,
    });
  }
});

// ─── POST /upload ─────────────────────────────────────────────────────────────
// Upload a document directly to the prospect-files storage account.
//
// This gives tab-app first-class write access to the same storage that
// instruct-pitch and enquiry-processing-v2 already read/write, creating a
// single, immutable evidence layer across all three surfaces.
//
// Body (multipart/form-data):
//   file          — the file buffer (required)
//   enquiry_id    — numeric enquiry id (required)
//   passcode      — workspace passcode (optional; auto-resolved if missing)
//   subfolder     — target folder inside the workspace, e.g. "Evidence" or "Holding" (default: "Evidence")
//   document_type — freeform label, e.g. "eid-raw-record", "risk-assessment" (optional)
//   uploaded_by   — email or name of the uploader (optional; defaults to "Hub")
//
// Blob path: enquiries/{enquiryId}/{passcode}/{subfolder}/{timestamp}-{rand}-{filename}
//
// Folder creation is handled automatically (blob storage is prefix-based; a
// .keep marker is written when the subfolder doesn't yet exist).
// ──────────────────────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  const start = Date.now();
  try {
    // ── Validate inputs ────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const enquiryIdRaw = req.body?.enquiry_id;
    const enquiryId = Number.parseInt(String(enquiryIdRaw ?? ''), 10);
    if (!Number.isFinite(enquiryId) || enquiryId <= 0) {
      return res.status(400).json({ error: 'Missing or invalid enquiry_id' });
    }

    const subfolder = String(req.body?.subfolder || 'Evidence').trim();
    if (!ALLOWED_SUBFOLDERS.has(subfolder)) {
      return res.status(400).json({ error: `Subfolder "${subfolder}" is not allowed`, allowedSubfolders: Array.from(ALLOWED_SUBFOLDERS) });
    }

    const documentType = String(req.body?.document_type || '').trim() || null;
    const uploadedBy = String(req.body?.uploaded_by || 'Hub').trim();

    // ── Resolve passcode ───────────────────────────────────────────────────
    let passcode = String(req.body?.passcode || '').trim();
    if (!passcode) {
      // Auto-resolve from existing workspace
      const svc = getBlobServiceClient();
      const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);
      const workspace = await resolveLatestWorkspace(containerClient, enquiryId);
      passcode = workspace?.passcode || '';
    }

    if (!passcode) {
      return res.status(404).json({
        error: 'No workspace found for this enquiry. Create a doc-request workspace first.',
      });
    }

    // ── Storage setup ──────────────────────────────────────────────────────
    const svc = getBlobServiceClient();
    const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);

    // Ensure the subfolder exists (idempotent .keep marker)
    const keepBlobName = `enquiries/${enquiryId}/${passcode}/${subfolder}/.keep`;
    try {
      const keepBlob = containerClient.getBlockBlobClient(keepBlobName);
      const keepExists = await keepBlob.exists();
      if (!keepExists) {
        await keepBlob.uploadData(Buffer.from(''), {
          blobHTTPHeaders: { blobContentType: 'text/plain' },
        });
        safeLog('upload:subfolderCreated', { enquiryId, passcode, subfolder });
      }
    } catch (keepErr) {
      // Non-fatal; the upload itself may still succeed because blob storage
      // doesn't truly require folder prefixes to exist.
      safeLog('upload:keepMarkerFailed', { enquiryId, subfolder, error: keepErr?.message });
    }

    // ── Upload the file ────────────────────────────────────────────────────
    const safeFilename = String(req.file.originalname || 'document')
      .replace(/[^\w.\-() ]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 200);

    const unique = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const blobName = `enquiries/${enquiryId}/${passcode}/${subfolder}/${unique}-${safeFilename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: {
        blobContentType: req.file.mimetype || 'application/octet-stream',
      },
      metadata: {
        enquiryId: String(enquiryId),
        passcode,
        subfolder,
        documentType: documentType || '',
        uploadedBy,
        uploadedAt: new Date().toISOString(),
        source: 'hub',
      },
    });

    const durationMs = Date.now() - start;

    // Generate a read URL for immediate use
    const sasUrl = await generateBlobReadSasUrl(PROSPECT_CONTAINER, blobName, safeFilename, 60);

    safeLog('upload:completed', {
      enquiryId,
      passcode,
      subfolder,
      blobName,
      sizeBytes: req.file.size,
      documentType,
      uploadedBy,
      durationMs,
    });

    trackEvent('DocWorkspace.Upload.Completed', {
      enquiryId: String(enquiryId),
      passcode,
      subfolder,
      documentType: documentType || '',
      uploadedBy,
      fileName: safeFilename,
      sizeBytes: String(req.file.size),
      durationMs: String(durationMs),
    });
    trackMetric('DocWorkspace.Upload.Duration', durationMs, { enquiryId: String(enquiryId) });

    return res.json({
      ok: true,
      blobName,
      blobUrl: sasUrl || blockBlobClient.url,
      originalFilename: safeFilename,
      fileSize: req.file.size,
      contentType: req.file.mimetype || 'application/octet-stream',
      documentType,
      subfolder,
      enquiryId,
      passcode,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const enquiryId = req.body?.enquiry_id;

    console.error('[doc-workspace] upload failed', {
      enquiryId,
      name: err?.name,
      message: err?.message,
    });

    trackException(err, {
      operation: 'DocWorkspace.Upload',
      enquiryId: String(enquiryId ?? ''),
      phase: 'upload',
    });
    trackEvent('DocWorkspace.Upload.Failed', {
      enquiryId: String(enquiryId ?? ''),
      error: err?.message || 'unknown',
      durationMs: String(durationMs),
    });

    return res.status(500).json({ error: 'Failed to upload document' });
  }
});

module.exports = router;
