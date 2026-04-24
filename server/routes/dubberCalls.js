/* eslint-disable no-console */
const express = require('express');
const path = require('path');
const sql = require('mssql');
const https = require('https');
const { randomUUID } = require('crypto');
const opLog = require('../utils/opLog');
const { getPool, withRequest } = require('../utils/db');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { getClioId } = require('../utils/teamLookup');
const { chatCompletion } = require('../utils/aiClient');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { deleteCachePattern } = require('../utils/redisClient');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel,
} = require('docx');

const router = express.Router();

const isUsableConnectionString = (value) => typeof value === 'string'
  && value.trim().length > 0
  && !value.includes('***')
  && !value.includes('REDACTED')
  && !value.includes('<REDACTED>');

let cachedInstructionsConnStr = null;

function buildInstructionsConnectionString(password) {
  const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
  const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
  const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
  return `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

function shouldRefreshInstructionsConnection(err) {
  const code = String(err?.code || err?.originalError?.code || err?.cause?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  if (['ECONNCLOSED', 'ETIMEOUT', 'ETIMEDOUT', 'ESOCKET', 'ELOGIN', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  return message.includes('operation timed out')
    || message.includes('failed to connect to')
    || message.includes('login failed')
    || message.includes('getaddrinfo');
}

async function resolveInstructionsConnectionString({ forceRefresh = false } = {}) {
  if (!forceRefresh && isUsableConnectionString(cachedInstructionsConnStr)) {
    return cachedInstructionsConnStr;
  }

  const envConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!forceRefresh && isUsableConnectionString(envConnStr)) {
    cachedInstructionsConnStr = envConnStr;
    return envConnStr;
  }

  const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';
  const password = await getSecret(secretName);
  if (!password) {
    throw new Error(`Missing Instructions SQL password secret: ${secretName}`);
  }

  const nextConnStr = buildInstructionsConnectionString(password);
  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = nextConnStr;
  cachedInstructionsConnStr = nextConnStr;
  return nextConnStr;
}

async function withInstructionsRequest(executor, { retries = 2, forceRefresh = false, refreshOnFailure = true } = {}) {
  const connStr = await resolveInstructionsConnectionString({ forceRefresh });
  try {
    return await withRequest(connStr, executor, retries);
  } catch (err) {
    if (!refreshOnFailure || forceRefresh || !shouldRefreshInstructionsConnection(err)) {
      throw err;
    }

    const freshConnStr = await resolveInstructionsConnectionString({ forceRefresh: true });
    return withRequest(freshConnStr, executor, retries);
  }
}

// ── Azure Blob Storage for attendance notes ────────────────────────────────
const STORAGE_ACCOUNT_NAME = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_NAME || 'instructionfiles';
const ATTENDANCE_BLOB_CONTAINER = 'attendance-notes';
let _blobClient = null;

function getAttendanceBlobClient() {
  if (_blobClient) return _blobClient;
  const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
  const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (connectionString) {
    _blobClient = BlobServiceClient.fromConnectionString(connectionString);
    return _blobClient;
  }
  if (accountKey) {
    const cred = new StorageSharedKeyCredential(STORAGE_ACCOUNT_NAME, accountKey);
    _blobClient = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, cred);
    return _blobClient;
  }
  const { getCredential } = require('../utils/getSecret');
  _blobClient = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, getCredential());
  return _blobClient;
}

// ── NetDocuments helpers (local to this router) ────────────────────────────
let _ndTokenCache = null;

async function getNdAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_ndTokenCache && _ndTokenCache.exp > now + 90) return _ndTokenCache.token;

  const [authUrl, clientId, clientSecret, repository, scope] = await Promise.all([
    getSecret('nd-authurl'),
    getSecret('nd-serviceaccount-clientid'), getSecret('nd-serviceaccount-clientsecret'),
    getSecret('nd-repository'), getSecret('nd-scope').catch(() => null),
  ]);
  // Append |repository to clientId if not already present (matches resources-core auth)
  const needsRepoSuffix = repository && !String(clientId).includes('|');
  const finalClientId = needsRepoSuffix ? `${clientId}|${repository}` : String(clientId);
  const tokenBasic = Buffer.from(`${finalClientId}:${clientSecret}`).toString('base64');
  // Use literal space in scope (ND API requires it, not URL-encoded +)
  const bodyStr = `grant_type=client_credentials&scope=${scope || 'full'}`;
  const urlObj = new URL(String(authUrl));
  const tokenData = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'POST',
      headers: { Authorization: `Basic ${tokenBasic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; }); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error(d)); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('ND token timeout')); });
    req.write(bodyStr); req.end();
  });
  const accessToken = tokenData.access_token || tokenData.token;
  if (!accessToken) throw new Error('ND access token missing');
  _ndTokenCache = { token: accessToken, exp: now + (tokenData.expires_in || 3600) };
  return accessToken;
}

function clearNdTokenCache() { _ndTokenCache = null; }

async function ndApiRequest(path, accessToken) {
  const baseUrl = await getSecret('nd-baseurl');
  const urlObj = new URL(`${String(baseUrl).replace(/\/$/, '')}${path}`);

  function execute(token) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, (res) => {
        let d = ''; res.on('data', c => { d += c; }); res.on('end', () => {
          if ((res.statusCode || 500) >= 400) { reject({ status: res.statusCode, message: d || `ND API ${res.statusCode}` }); return; }
          try { resolve(JSON.parse(d)); } catch { resolve({}); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('ND API timeout')); });
      req.end();
    });
  }

  try {
    return await execute(accessToken);
  } catch (err) {
    // Retry once on 401 with a fresh token (matches resources-core pattern)
    if (err && err.status === 401) {
      clearNdTokenCache();
      const freshToken = await getNdAccessToken();
      return await execute(freshToken);
    }
    throw err;
  }
}

function buildNdMultipartBody({ workspaceId, fileName, fileBuffer, cabinet }) {
  const path = require('path');
  const boundary = `----HelixAttNoteBoundary${Date.now().toString(16)}`;
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

// ── Attendance note docx generator ─────────────────────────────────────────
const HELIX = { websiteBlue: '000319', darkBlue: '061733', helixBlue: '0D2F60', highlight: '3690CE', greyText: '6B6B6B' };
const FONT = 'Raleway';
const BODY_SIZE = 20; // 10pt

async function generateAttendanceNoteDocx(note) {
  const doc = new Document({
    creator: 'Helix Hub',
    title: `Attendance Note – ${note.date || 'Undated'}`,
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE, color: HELIX.darkBlue } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'HELIX LAW', font: FONT, size: 30, bold: true, color: HELIX.darkBlue })], spacing: { after: 80 } }),
        new Paragraph({
          children: [new TextRun({ text: 'Second Floor, Britannia House · 21 Station Street · Brighton · BN1 4DE', font: FONT, size: 18, color: HELIX.greyText })],
          spacing: { after: 180 },
          border: { bottom: { color: HELIX.highlight, style: BorderStyle.SINGLE, size: 8, space: 6 } },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'ATTENDANCE NOTE', font: FONT, size: 24, bold: true, color: HELIX.helixBlue })],
          heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 120 },
        }),
        // Metadata
        new Paragraph({ children: [new TextRun({ text: `Date: ${note.date || '—'}`, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: `Duration: ${note.duration || 0} minutes`, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: `From: ${note.parties?.from || '—'}`, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: `To: ${note.parties?.to || '—'}`, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { after: 40 } }),
        ...(note.teamMember ? [new Paragraph({ children: [new TextRun({ text: `Fee Earner: ${note.teamMember}`, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { after: 120 } })] : []),
        // Summary
        new Paragraph({
          children: [new TextRun({ text: 'Summary', font: FONT, size: 22, bold: true, color: HELIX.helixBlue })],
          heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 },
          border: { bottom: { color: HELIX.highlight, style: BorderStyle.SINGLE, size: 4, space: 4 } },
        }),
        new Paragraph({ children: [new TextRun({ text: note.summary || '', font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { line: 276, after: 120 }, alignment: AlignmentType.JUSTIFIED }),
        // Topics
        ...(note.topics?.length > 0 ? [
          new Paragraph({
            children: [new TextRun({ text: 'Topics', font: FONT, size: 22, bold: true, color: HELIX.helixBlue })],
            heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 },
            border: { bottom: { color: HELIX.highlight, style: BorderStyle.SINGLE, size: 4, space: 4 } },
          }),
          ...note.topics.map(t => new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], bullet: { level: 0 }, spacing: { after: 40 } })),
        ] : []),
        // Attendance Note body
        new Paragraph({
          children: [new TextRun({ text: 'Attendance Note', font: FONT, size: 22, bold: true, color: HELIX.helixBlue })],
          heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 },
          border: { bottom: { color: HELIX.highlight, style: BorderStyle.SINGLE, size: 4, space: 4 } },
        }),
        ...(note.attendanceNote || '').split('\n').filter(l => l.trim()).map(line =>
          new Paragraph({ children: [new TextRun({ text: line, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], spacing: { line: 276, after: 80 }, alignment: AlignmentType.JUSTIFIED }),
        ),
        // Action Items
        ...(note.actionItems?.length > 0 ? [
          new Paragraph({
            children: [new TextRun({ text: 'Action Items', font: FONT, size: 22, bold: true, color: HELIX.helixBlue })],
            heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 },
            border: { bottom: { color: HELIX.highlight, style: BorderStyle.SINGLE, size: 4, space: 4 } },
          }),
          ...note.actionItems.map(a => new Paragraph({ children: [new TextRun({ text: a, font: FONT, size: BODY_SIZE, color: HELIX.darkBlue })], bullet: { level: 0 }, spacing: { after: 40 } })),
        ] : []),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** Get the Instructions DB pool (Dubber tables live here). */
async function instrPool({ forceRefresh = false } = {}) {
  const connStr = await resolveInstructionsConnectionString({ forceRefresh });
  try {
    return await getPool(connStr);
  } catch (err) {
    if (forceRefresh || !shouldRefreshInstructionsConnection(err)) {
      throw err;
    }

    const freshConnStr = await resolveInstructionsConnectionString({ forceRefresh: true });
    return getPool(freshConnStr);
  }
}

/** Get the Core Data DB pool (enquiries live here). */
function corePool() {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
}

async function resolveMatterDisplayNumberById(matterId) {
  if (!matterId) return null;
  try {
    const pool = await corePool();
    const result = await pool.request()
      .input('matterId', sql.NVarChar, String(matterId))
      .query(`
        SELECT TOP 1 [Display Number] AS display_number
        FROM matters
        WHERE CONVERT(NVARCHAR(100), [Unique ID]) = @matterId
      `);
    return result.recordset[0]?.display_number || null;
  } catch (err) {
    console.warn('[dubber] matter display lookup failed:', err.message);
    return null;
  }
}

/** Opposite direction of `resolveMatterDisplayNumberById`: display number → Clio Unique ID. */
async function resolveClioMatterIdFromDisplayNumber(displayNumber) {
  const display = String(displayNumber || '').trim();
  if (!display) return null;
  try {
    const pool = await corePool();
    const result = await pool.request()
      .input('display', sql.NVarChar, display)
      .query(`
        SELECT TOP 1 [Unique ID] AS unique_id
        FROM matters
        WHERE [Display Number] = @display
      `);
    const id = result.recordset[0]?.unique_id;
    return id != null ? String(id) : null;
  } catch (err) {
    console.warn('[dubber] matter id lookup failed:', err.message);
    return null;
  }
}

async function resolveNdWorkspaceRef(rawMatterRef) {
  const requestedRef = String(rawMatterRef || '').trim();
  if (!requestedRef) return { requestedRef, resolvedRef: '', source: 'missing' };
  if (!/^HLX-/i.test(requestedRef)) {
    return { requestedRef, resolvedRef: requestedRef, source: 'provided' };
  }

  try {
    const pool = await instrPool();
    const instructionResult = await pool.request()
      .input('instructionRef', sql.NVarChar, requestedRef)
      .query(`
        SELECT TOP 1 MatterId
        FROM Instructions
        WHERE InstructionRef = @instructionRef
      `);

    const clioMatterId = instructionResult.recordset[0]?.MatterId;
    if (!clioMatterId) {
      return { requestedRef, resolvedRef: requestedRef, source: 'instruction-ref-no-matter' };
    }

    const displayNumber = await resolveMatterDisplayNumberById(clioMatterId);
    if (!displayNumber) {
      return { requestedRef, resolvedRef: requestedRef, source: 'instruction-ref-no-display-number' };
    }

    return {
      requestedRef,
      resolvedRef: String(displayNumber).trim(),
      source: 'instruction-ref-resolved',
      clioMatterId: String(clioMatterId),
    };
  } catch (err) {
    console.warn('[dubber] ND workspace ref resolution failed:', err.message);
    return { requestedRef, resolvedRef: requestedRef, source: 'instruction-ref-lookup-failed' };
  }
}

/** Strip a phone string to normalised digits for matching. */
function normDigits(raw) {
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('44')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Returns true if the string looks like a phone number (7+ digits). */
function looksLikePhone(str) {
  if (!str) return false;
  return str.replace(/\D/g, '').length >= 7;
}

// ── Shared column list ────────────────────────────────────────────────────
const RECORDING_COLS = `
  r.recording_id,
  r.from_party,
  r.from_label,
  r.to_party,
  r.to_label,
  r.call_type,
  r.duration_seconds,
  r.start_time_utc,
  r.document_sentiment_score,
  r.ai_document_sentiment,
  r.channel,
  r.status,
  r.matched_team_initials,
  r.matched_team_email,
  r.match_strategy,
  r.document_emotion_json
`.trim();

/**
 * GET /api/dubberCalls?teamInitials=BR&limit=20
 * Returns Dubber recordings for a given team member, with is_internal flag.
 */
router.get('/dubberCalls', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const teamInitials = String(req.query.teamInitials || '').trim().toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!teamInitials) {
      return res.status(400).json({ error: 'Missing teamInitials query parameter' });
    }

    opLog.append({
      type: 'dubber.calls.byTeam',
      reqId,
      route: 'server:/api/dubberCalls',
      teamInitials,
    });

    const pool = await instrPool();
    const [recResult, userMapResult] = await Promise.all([
      pool.request()
        .input('initials', sql.NVarChar, teamInitials)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit) ${RECORDING_COLS}
          FROM dbo.dubber_recordings r
          WHERE r.matched_team_initials = @initials
          ORDER BY r.start_time_utc DESC
        `),
      pool.request().query(`
        SELECT display_name, first_name, last_name, matched_team_email
        FROM dbo.dubber_user_map
      `),
    ]);

    // Build team names set for internal detection
    const teamNames = new Set();
    for (const u of userMapResult.recordset) {
      if (u.display_name) teamNames.add(u.display_name.toLowerCase());
      if (u.first_name && u.last_name) teamNames.add(`${u.first_name} ${u.last_name}`.toLowerCase());
      if (u.matched_team_email) teamNames.add(u.matched_team_email.toLowerCase());
    }

    const recordings = recResult.recordset.map(r => {
      const fromStr = (r.from_label || r.from_party || '').toLowerCase();
      const toStr = (r.to_label || r.to_party || '').toLowerCase();
      return { ...r, is_internal: teamNames.has(fromStr) && teamNames.has(toStr) };
    });

    // ── Resolve phone numbers to names from enquiry tables ──
    const phonesToResolve = new Set();
    for (const r of recordings) {
      const isInbound = r.call_type === 'inbound';
      const partyField = isInbound ? 'from' : 'to';
      const label = r[`${partyField}_label`];
      const party = r[`${partyField}_party`];
      // Resolve when label is a phone number OR when there's no label and party is a phone
      const phoneSource = looksLikePhone(label) ? label : (!label && looksLikePhone(party) ? party : null);
      if (phoneSource) {
        phonesToResolve.add(normDigits(phoneSource));
      }
    }

    let phoneNameMap = {};
    if (phonesToResolve.size > 0) {
      phoneNameMap = await resolvePhoneNames([...phonesToResolve]);
    }

    // Attach resolved names to recordings
    const enriched = recordings.map(r => {
      const isInbound = r.call_type === 'inbound';
      const partyField = isInbound ? 'from' : 'to';
      const label = r[`${partyField}_label`];
      const party = r[`${partyField}_party`];
      const phoneSource = looksLikePhone(label) ? label : (!label && looksLikePhone(party) ? party : null);
      if (phoneSource) {
        const norm = normDigits(phoneSource);
        const match = phoneNameMap[norm];
        if (match) {
          return { ...r, resolved_name: match.name, resolved_source: match.source, resolved_ref: match.ref || null, resolved_area: match.areaOfWork || null };
        }
      }
      return r;
    });

    opLog.append({
      type: 'dubber.calls.byTeam.result',
      reqId,
      count: enriched.length,
      resolved: Object.keys(phoneNameMap).length,
      durationMs: Date.now() - started,
    });

    return res.json({ recordings: enriched });
  } catch (err) {
    console.error(`[dubber ${reqId}] byTeam error:`, err?.message || err);
    opLog.append({ type: 'dubber.calls.byTeam.error', reqId, error: String(err?.message || err) });
    return res.status(500).json({ error: 'Failed to query Dubber recordings' });
  }
});

/**
 * POST /api/dubberCalls/search
 * Search Dubber recordings by phone number and/or name.
 * Body: { phoneNumber?, name?, maxResults? }
 */
router.post('/dubberCalls/search', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const body = req.body || {};
    const phoneNumber = String(body.phoneNumber || '').replace(/\s/g, '').trim();
    const name = String(body.name || '').trim();
    const maxResults = Math.min(Number(body.maxResults) || 50, 200);

    if (!phoneNumber && !name) {
      return res.status(400).json({ error: 'Provide phoneNumber or name' });
    }

    opLog.append({
      type: 'dubber.calls.search',
      reqId,
      route: 'server:/api/dubberCalls/search',
      phoneNumber: phoneNumber || null,
      name: name || null,
    });

    const pool = await instrPool();
    const request = pool.request();
    const conditions = [];

    if (phoneNumber) {
      // Normalize: strip leading +, leading 44/0, keep digits
      let digits = phoneNumber.replace(/\D/g, '');
      if (digits.startsWith('44')) digits = digits.slice(2);
      if (digits.startsWith('0')) digits = digits.slice(1);
      const searchDigits = `%${digits}%`;
      request.input('phone', sql.NVarChar, searchDigits);
      conditions.push('(r.to_party LIKE @phone OR r.from_party LIKE @phone)');
    }

    if (name) {
      request.input('name', sql.NVarChar, `%${name}%`);
      conditions.push('(r.to_party LIKE @name OR r.from_party LIKE @name OR r.to_label LIKE @name OR r.from_label LIKE @name)');
    }

    request.input('max', sql.Int, maxResults);

    const result = await request.query(`
      SELECT TOP (@max) ${RECORDING_COLS}
      FROM dbo.dubber_recordings r
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.start_time_utc DESC
    `);

    opLog.append({
      type: 'dubber.calls.search.result',
      reqId,
      count: result.recordset.length,
      durationMs: Date.now() - started,
    });

    return res.json({
      success: true,
      recordings: result.recordset,
      totalCount: result.recordset.length,
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] search error:`, err?.message || err);
    opLog.append({ type: 'dubber.calls.search.error', reqId, error: String(err?.message || err) });
    return res.status(500).json({ error: 'Failed to search Dubber recordings' });
  }
});

/**
 * GET /api/dubberCalls/:recordingId/transcript
 * Returns transcript sentences + recording metadata for a given recording.
 */
router.get('/dubberCalls/:recordingId/transcript', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) {
      return res.status(400).json({ error: 'Missing recordingId' });
    }

    trackEvent('Dubber.Transcript.Fetch.Started', { reqId, recordingId, triggeredBy: 'home-journey' });

    const { sentenceResult, recResult, summaryResult } = await withInstructionsRequest(async (request, sqlClient) => {
      const pool = request.parent;
      const [nextSentenceResult, nextRecResult, nextSummaryResult] = await Promise.all([
        new sqlClient.Request(pool)
          .input('rid', sqlClient.NVarChar, recordingId)
          .query(`
            SELECT sentence_index, speaker, content, sentiment
            FROM dbo.dubber_transcript_sentences
            WHERE recording_id = @rid
            ORDER BY sentence_index
          `),
        new sqlClient.Request(pool)
          .input('rid', sqlClient.NVarChar, recordingId)
          .query(`
            SELECT document_sentiment_score, ai_document_sentiment, document_emotion_json,
                   from_party, from_label, to_party, to_label, call_type, duration_seconds,
                   start_time_utc, matched_team_initials, channel
            FROM dbo.dubber_recordings
            WHERE recording_id = @rid
          `),
        new sqlClient.Request(pool)
          .input('rid', sqlClient.NVarChar, recordingId)
          .query(`
            SELECT summary_source, summary_type, summary_text
            FROM dbo.dubber_recording_summaries
            WHERE recording_id = @rid
          `),
      ]);

      return {
        sentenceResult: nextSentenceResult,
        recResult: nextRecResult,
        summaryResult: nextSummaryResult,
      };
    });

    const durationMs = Date.now() - started;
    trackEvent('Dubber.Transcript.Fetch.Completed', {
      reqId,
      recordingId,
      triggeredBy: 'home-journey',
      durationMs: String(durationMs),
      sentenceCount: String(sentenceResult.recordset.length),
      summaryCount: String(summaryResult.recordset.length),
      recordingFound: String(recResult.recordset.length > 0),
    });
    trackMetric('Dubber.Transcript.Fetch.Duration', durationMs, { recordingId, triggeredBy: 'home-journey' });

    return res.json({
      recordingId,
      sentenceCount: sentenceResult.recordset.length,
      sentences: sentenceResult.recordset,
      recording: recResult.recordset[0] || null,
      summaries: summaryResult.recordset,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    console.error(`[dubber ${reqId}] transcript error:`, err?.message || err);
    trackException(err instanceof Error ? err : new Error(String(err)), {
      operation: 'Dubber.Transcript.Fetch',
      reqId,
      phase: 'query',
      durationMs: String(durationMs),
    });
    trackEvent('Dubber.Transcript.Fetch.Failed', {
      reqId,
      triggeredBy: 'home-journey',
      durationMs: String(durationMs),
      error: String(err?.message || err),
    });
    return res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

/**
 * GET /api/dubberCalls/recent?limit=20
 * Returns the most recent Dubber recordings across all team members.
 * Each recording includes is_internal flag (true if both parties are mapped team members).
 */
router.get('/dubberCalls/recent', async (req, res) => {
  const reqId = randomUUID();
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const pool = await instrPool();
    const [recResult, userMapResult] = await Promise.all([
      pool.request()
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit) ${RECORDING_COLS}
          FROM dbo.dubber_recordings r
          ORDER BY r.start_time_utc DESC
        `),
      pool.request().query(`
        SELECT dubber_user_id, display_name, first_name, last_name,
               matched_team_initials, matched_team_email
        FROM dbo.dubber_user_map
      `),
    ]);

    // Build a set of known team member names/emails for internal detection
    const teamNames = new Set();
    for (const u of userMapResult.recordset) {
      if (u.display_name) teamNames.add(u.display_name.toLowerCase());
      if (u.first_name && u.last_name) teamNames.add(`${u.first_name} ${u.last_name}`.toLowerCase());
      if (u.matched_team_email) teamNames.add(u.matched_team_email.toLowerCase());
    }

    const recordings = recResult.recordset.map(r => {
      const fromStr = (r.from_label || r.from_party || '').toLowerCase();
      const toStr = (r.to_label || r.to_party || '').toLowerCase();
      const fromIsTeam = teamNames.has(fromStr);
      const toIsTeam = teamNames.has(toStr);
      return { ...r, is_internal: fromIsTeam && toIsTeam };
    });

    return res.json({ recordings });
  } catch (err) {
    console.error(`[dubber ${reqId}] recent error:`, err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch recent recordings' });
  }
});

// ── Phone → Name resolution (cross-DB) ───────────────────────────────────
/**
 * Given an array of normalised digit strings, search both enquiry tables
 * (Core Data + Instructions DB) and return a map:  normDigits → { name, source }.
 * All 3 lookups run in parallel for speed; priority: Core Data > Instructions enquiries > Instructions table.
 */
async function resolvePhoneNames(normDigitsArr) {
  if (!normDigitsArr.length) return {};

  const patterns = normDigitsArr.map(d => `%${d.slice(-7)}%`); // last 7 digits for reliable LIKE

  // ── Fire all 3 lookups in parallel ──
  const [coreResults, instrEnqResults, instrResults] = await Promise.all([
    // 1. Core Data DB — enquiries.Phone_Number
    (async () => {
      try {
        const mainConnStr = process.env.SQL_CONNECTION_STRING;
        if (!mainConnStr) return [];
        const pool = await corePool();
        const req = pool.request();
        const orClauses = [];
        patterns.forEach((pat, i) => {
          const param = `p${i}`;
          req.input(param, sql.NVarChar, pat);
          orClauses.push(`REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });
        const result = await req.query(`
          SELECT ID, First_Name, Last_Name, Phone_Number, Area_of_Work
          FROM enquiries
          WHERE ${orClauses.join(' OR ')}
        `);
        return result.recordset.map(row => ({
          norm: normDigits(row.Phone_Number),
          name: [row.First_Name, row.Last_Name].filter(Boolean).join(' '),
          source: 'enquiry',
          ref: row.ID ? String(row.ID) : null,
          areaOfWork: row.Area_of_Work || null,
        }));
      } catch (err) {
        console.warn('[dubber] Core Data phone resolve failed:', err.message);
        return [];
      }
    })(),

    // 2. Instructions DB — dbo.enquiries.phone
    (async () => {
      try {
        const pool = await instrPool();
        const req = pool.request();
        const orClauses = [];
        patterns.forEach((pat, i) => {
          const param = `ip${i}`;
          req.input(param, sql.NVarChar, pat);
          orClauses.push(`REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });
        const result = await req.query(`
          SELECT id, first AS First_Name, last AS Last_Name, phone, aow
          FROM dbo.enquiries
          WHERE ${orClauses.join(' OR ')}
        `);
        return result.recordset.map(row => ({
          norm: normDigits(row.phone),
          name: [row.First_Name, row.Last_Name].filter(Boolean).join(' '),
          source: 'enquiry-v2',
          ref: row.id ? String(row.id) : null,
          areaOfWork: row.aow || null,
        }));
      } catch (err) {
        console.warn('[dubber] Instructions DB phone resolve failed:', err.message);
        return [];
      }
    })(),

    // 3. Instructions DB — Instructions.Phone
    (async () => {
      try {
        const pool = await instrPool();
        const req = pool.request();
        const orClauses = [];
        patterns.forEach((pat, i) => {
          const param = `xp${i}`;
          req.input(param, sql.NVarChar, pat);
          orClauses.push(`REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });
        const result = await req.query(`
          SELECT InstructionRef, FirstName, LastName, Phone
          FROM Instructions
          WHERE ${orClauses.join(' OR ')}
        `);
        return result.recordset.map(row => ({
          norm: normDigits(row.Phone),
          name: [row.FirstName, row.LastName].filter(Boolean).join(' '),
          source: 'instructions',
          ref: row.InstructionRef || null,
          areaOfWork: null,
        }));
      } catch (err) {
        console.warn('[dubber] Instructions table phone resolve failed:', err.message);
        return [];
      }
    })(),
  ]);

  // ── Merge with priority: Core Data > Instructions enquiries > Instructions table ──
  const map = {};
  // Apply lowest priority first, higher priority overwrites
  for (const row of instrResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }
  for (const row of instrEnqResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }
  for (const row of coreResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }

  return map;
}

// ── PATCH /api/dubberCalls/:recordingId/resolve ────────────────────────────
/**
 * User confirms a resolved name — write it to from_label or to_label so it's
 * cached permanently and never needs resolving again.
 */
router.patch('/dubberCalls/:recordingId/resolve', async (req, res) => {
  const reqId = randomUUID();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    const { name, field } = req.body || {};
    // field must be 'from_label' or 'to_label'
    if (!recordingId || !name || !['from_label', 'to_label'].includes(field)) {
      return res.status(400).json({ error: 'Missing recordingId, name, or valid field (from_label|to_label)' });
    }

    const pool = await instrPool();
    await pool.request()
      .input('rid', sql.NVarChar, recordingId)
      .input('name', sql.NVarChar, String(name).slice(0, 200))
      .query(`UPDATE dbo.dubber_recordings SET ${field} = @name WHERE recording_id = @rid`);

    opLog.append({ type: 'dubber.resolve.confirmed', reqId, recordingId, field, name });
    return res.json({ ok: true });
  } catch (err) {
    console.error(`[dubber ${reqId}] resolve error:`, err?.message || err);
    return res.status(500).json({ error: 'Failed to update recording label' });
  }
});

// ── GET /api/dubberCalls/activities ─────────────────────────────────────────
/**
 * Fetch recent Clio time entries for a team member (last 7 days).
 * Query: ?initials=LZ          → single user
 *        ?initials=LZ&all=true  → all users (dev owner / god mode)
 * Returns array of time entry objects from Clio.
 */
router.get('/dubberCalls/activities', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const initials = String(req.query.initials || '').trim().toUpperCase();
    if (!initials) return res.status(400).json({ error: 'Missing initials' });

    const fetchAll = req.query.all === 'true';
    const requestedLimit = Number.parseInt(String(req.query.limit || '30'), 10);
    const responseLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 30;

    // For all-team view, use service account token and skip user_id filter
    let accessToken;
    let clioId = null;
    if (fetchAll) {
      accessToken = await getClioAccessToken(); // service account
    } else {
      clioId = await getClioId(initials);
      if (!clioId) return res.json({ activities: [], message: 'No Clio ID for user' });
      accessToken = await getClioAccessToken(initials);
    }
    if (!accessToken) return res.json({ activities: [], message: 'No Clio token available' });

    // Last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);

    const activities = [];
    let offset = 0;
    const limit = 200;
    const fields = 'id,date,quantity_in_hours,total,price,type,note,matter{id,display_number,description},activity_description{name},user{id,name}';

    while (true) {
      const params = new URLSearchParams({
        created_since: since.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        fields,
        limit: String(limit),
        offset: String(offset),
      });
      if (clioId) params.set('user_id', String(clioId));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const resp = await fetch(`${CLIO_API_BASE}/activities.json?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`Clio API ${resp.status}`);
        const data = await resp.json();
        if (data.data && Array.isArray(data.data)) {
          const remaining = responseLimit - activities.length;
          if (remaining > 0) {
            activities.push(...data.data.slice(0, remaining));
          }
        }
        if (activities.length >= responseLimit) break;
        if (!data.meta?.paging?.next || data.data.length < limit) break;
        offset += limit;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    trackEvent('Dubber.Activities.Fetched', {
      reqId,
      initials,
      fetchAll: String(fetchAll),
      count: String(activities.length),
      requestedLimit: String(responseLimit),
      durationMs: String(Date.now() - started),
    });
    return res.json({ activities });
  } catch (err) {
    console.error(`[dubber ${reqId}] activities error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.Activities.Fetch', reqId });
    return res.status(500).json({ error: 'Failed to fetch Clio activities' });
  }
});

// ── POST /api/dubberCalls/:recordingId/attendance-note ─────────────────────
/**
 * Generate an AI attendance note from a call transcript.
 * Returns { note: { summary, topics, actionItems, duration, date, parties } }
 */
router.post('/dubberCalls/:recordingId/attendance-note', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const pool = await instrPool();

    // Fetch transcript + recording meta in parallel
    const [sentenceResult, recResult, summaryResult] = await Promise.all([
      pool.request()
        .input('rid', sql.NVarChar, recordingId)
        .query(`
          SELECT sentence_index, speaker, content, sentiment
          FROM dbo.dubber_transcript_sentences
          WHERE recording_id = @rid
          ORDER BY sentence_index
        `),
      pool.request()
        .input('rid', sql.NVarChar, recordingId)
        .query(`
          SELECT from_party, from_label, to_party, to_label, call_type,
                 duration_seconds, start_time_utc, matched_team_initials
          FROM dbo.dubber_recordings
          WHERE recording_id = @rid
        `),
      pool.request()
        .input('rid', sql.NVarChar, recordingId)
        .query(`
          SELECT summary_text FROM dbo.dubber_recording_summaries
          WHERE recording_id = @rid AND summary_type = 'overall'
        `),
    ]);

    const recording = recResult.recordset[0];
    if (!recording) return res.status(404).json({ error: 'Recording not found' });

    const sentences = sentenceResult.recordset;
    const existingSummary = summaryResult.recordset[0]?.summary_text || '';

    if (sentences.length === 0 && !existingSummary) {
      return res.status(422).json({ error: 'No transcript available for this call', code: 'NO_TRANSCRIPT' });
    }

    // Build transcript text for AI
    const transcriptText = sentences.length > 0
      ? sentences.map(s => `${s.speaker}: ${s.content}`).join('\n')
      : existingSummary;

    const fromParty = recording.from_label || recording.from_party || 'Unknown';
    const toParty = recording.to_label || recording.to_party || 'Unknown';
    const callDate = recording.start_time_utc ? new Date(recording.start_time_utc).toISOString().slice(0, 10) : 'Unknown';
    const durationMins = recording.duration_seconds ? Math.ceil(recording.duration_seconds / 60) : 0;

    const systemPrompt = `You are a legal attendance note writer for Helix Law, a specialist litigation firm regulated by the SRA. Helix Law acts across four core practice areas: commercial disputes, property disputes, construction disputes, and employment law. Generate a professional attendance note from the following telephone call transcript. The note should be suitable for filing in the client matter.

Return JSON with this structure:
{
  "summary": "2-4 sentence overview of the call",
  "topics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"],
  "attendanceNote": "Full formatted attendance note text suitable for a legal file. Use professional legal language. Include key points discussed, advice given, instructions received, and next steps. Format with clear paragraphs."
}`;

    const userPrompt = `Call details:
- Date: ${callDate}
- Duration: ${durationMins} minutes
- From: ${fromParty}
- To: ${toParty}
- Direction: ${recording.call_type || 'unknown'}
- Team member: ${recording.matched_team_initials || 'unknown'}

Transcript:
${transcriptText}`;

    let aiResult;
    try {
      aiResult = await chatCompletion(systemPrompt, userPrompt, { temperature: 0.3 });
    } catch (aiErr) {
      const durationMs = Date.now() - started;
      console.error(`[dubber ${reqId}] AI call failed:`, aiErr?.message || aiErr);
      trackException(aiErr instanceof Error ? aiErr : new Error(String(aiErr)), { operation: 'Dubber.AttendanceNote.AI', reqId, recordingId, durationMs: String(durationMs) });
      return res.status(502).json({ error: 'AI service unavailable', code: 'AI_UNAVAILABLE' });
    }

    if (aiResult?._parseError) {
      const durationMs = Date.now() - started;
      trackEvent('Dubber.AttendanceNote.ParseError', { reqId, recordingId, durationMs: String(durationMs), raw: String(aiResult._raw || '').slice(0, 500) });
      return res.status(502).json({ error: 'AI returned invalid response', code: 'AI_PARSE_ERROR' });
    }

    const durationMs = Date.now() - started;
    trackEvent('Dubber.AttendanceNote.Generated', { reqId, recordingId, durationMs: String(durationMs), sentenceCount: String(sentences.length) });
    trackMetric('Dubber.AttendanceNote.Duration', durationMs, { recordingId });

    return res.json({
      note: {
        summary: aiResult.summary || '',
        topics: aiResult.topics || [],
        actionItems: aiResult.actionItems || [],
        attendanceNote: aiResult.attendanceNote || '',
        duration: durationMins,
        date: callDate,
        parties: { from: fromParty, to: toParty },
        teamMember: recording.matched_team_initials || null,
        systemPrompt,
        userPrompt,
      },
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] attendance-note error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.Generate', reqId });
    return res.status(500).json({ error: 'Failed to generate attendance note', code: 'DB_ERROR' });
  }
});

// ── GET /api/dubberCalls/:recordingId/matter-chain ─────────────────────────
/**
 * Given a recording, trace the phone number through enquiry → deal → instruction → Clio matter.
 * Returns the chain of matched entities.
 */
router.get('/dubberCalls/:recordingId/matter-chain', async (req, res) => {
  const reqId = randomUUID();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const pool = await instrPool();

    // Get the recording to find the external phone number
    const recResult = await pool.request()
      .input('rid', sql.NVarChar, recordingId)
      .query(`
        SELECT from_party, from_label, to_party, to_label, call_type, matched_team_initials
        FROM dbo.dubber_recordings WHERE recording_id = @rid
      `);
    const rec = recResult.recordset[0];
    if (!rec) return res.status(404).json({ error: 'Recording not found' });

    // Determine external party phone
    const isInbound = rec.call_type === 'inbound';
    const externalPhone = isInbound ? (rec.from_party || '') : (rec.to_party || '');
    const externalName = isInbound ? (rec.from_label || '') : (rec.to_label || '');
    const norm = normDigits(externalPhone);

    if (!norm) return res.json({ chain: null, message: 'No external phone number on recording' });

    const chain = { phone: externalPhone, name: externalName, enquiry: null, deal: null, instruction: null, matter: null };

    // ── Parallel batch: all three phone-based lookups fire simultaneously ───
    const phoneSuffix = `%${norm.slice(-7)}%`;

    const [coreEnquiry, instrEnquiryAndDeal, instrByPhone] = await Promise.all([
      // Branch A: Core Data enquiry by phone
      (async () => {
        try {
          const coreP = await corePool();
          const r = await coreP.request()
            .input('phone', sql.NVarChar, phoneSuffix)
            .query(`
              SELECT TOP 1 ID, First_Name, Last_Name, Phone_Number, Area_of_Work
              FROM enquiries
              WHERE REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', '') LIKE @phone
              ORDER BY ID DESC
            `);
          return r.recordset[0] || null;
        } catch (err) {
          console.warn('[dubber] matter-chain: Core Data enquiry lookup failed:', err.message);
          return null;
        }
      })(),

      // Branch B: Instructions enquiry by phone → conditional deal by prospect_id
      (async () => {
        try {
          const r = await pool.request()
            .input('phone', sql.NVarChar, phoneSuffix)
            .query(`
              SELECT TOP 1 id, prospect_id, first, last, area_of_work
              FROM dbo.enquiries
              WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE @phone
              ORDER BY id DESC
            `);
          const eq = r.recordset[0] || null;
          let deal = null;
          if (eq?.prospect_id) {
            const dr = await pool.request()
              .input('pid', sql.NVarChar, String(eq.prospect_id))
              .query(`
                SELECT TOP 1 DealId, InstructionRef, Amount, ServiceDescription
                FROM Deals WHERE ProspectId = @pid ORDER BY DealId DESC
              `);
            deal = dr.recordset[0] || null;
          }
          return { enquiry: eq, deal };
        } catch (err) {
          console.warn('[dubber] matter-chain: Instructions DB lookup failed:', err.message);
          return { enquiry: null, deal: null };
        }
      })(),

      // Branch C: Instructions table by phone
      (async () => {
        try {
          const r = await pool.request()
            .input('phone', sql.NVarChar, phoneSuffix)
            .query(`
              SELECT TOP 1 InstructionRef, ClientId, MatterId, FirstName, LastName, ServiceDescription, Stage
              FROM Instructions
              WHERE REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '+', ''), '-', '') LIKE @phone
              ORDER BY InstructionRef DESC
            `);
          return r.recordset[0] || null;
        } catch (err) {
          console.warn('[dubber] matter-chain: Instruction phone lookup failed:', err.message);
          return null;
        }
      })(),
    ]);

    // ── Assemble chain from parallel results ────────────────────────────────
    // Enquiry: prefer Core Data, fall back to Instructions enquiry
    if (coreEnquiry) {
      chain.enquiry = { id: coreEnquiry.ID, name: [coreEnquiry.First_Name, coreEnquiry.Last_Name].filter(Boolean).join(' '), areaOfWork: coreEnquiry.Area_of_Work };
    } else if (instrEnquiryAndDeal.enquiry) {
      const eq = instrEnquiryAndDeal.enquiry;
      chain.enquiry = { id: eq.id, name: [eq.first, eq.last].filter(Boolean).join(' '), areaOfWork: eq.area_of_work };
    }

    // Deal
    if (instrEnquiryAndDeal.deal) {
      const d = instrEnquiryAndDeal.deal;
      chain.deal = { dealId: d.DealId, instructionRef: d.InstructionRef, amount: d.Amount, service: d.ServiceDescription };
    }

    // Instruction + matter: prefer phone-matched, fall back to deal's InstructionRef
    if (instrByPhone) {
      chain.instruction = {
        ref: instrByPhone.InstructionRef,
        name: [instrByPhone.FirstName, instrByPhone.LastName].filter(Boolean).join(' '),
        service: instrByPhone.ServiceDescription,
        stage: instrByPhone.Stage,
        clioClientId: instrByPhone.ClientId || null,
        clioMatterId: instrByPhone.MatterId || null,
      };
      if (instrByPhone.MatterId) {
        chain.matter = { clioMatterId: instrByPhone.MatterId, clioClientId: instrByPhone.ClientId || null };
      }
    } else if (chain.deal?.instructionRef) {
      // Fallback: single sequential query only when phone match missed
      try {
        const r = await pool.request()
          .input('ref', sql.NVarChar, chain.deal.instructionRef)
          .query(`
            SELECT InstructionRef, ClientId, MatterId, FirstName, LastName, ServiceDescription, Stage
            FROM Instructions WHERE InstructionRef = @ref
          `);
        const instr = r.recordset[0];
        if (instr) {
          chain.instruction = {
            ref: instr.InstructionRef,
            name: [instr.FirstName, instr.LastName].filter(Boolean).join(' '),
            service: instr.ServiceDescription,
            stage: instr.Stage,
            clioClientId: instr.ClientId || null,
            clioMatterId: instr.MatterId || null,
          };
          if (instr.MatterId) {
            chain.matter = { clioMatterId: instr.MatterId, clioClientId: instr.ClientId || null };
          }
        }
      } catch (err) {
        console.warn('[dubber] matter-chain: Instruction ref fallback failed:', err.message);
      }
    }

    if (chain.matter?.clioMatterId) {
      const matterDisplayNumber = await resolveMatterDisplayNumberById(chain.matter.clioMatterId);
      if (matterDisplayNumber) {
        chain.matter.displayNumber = matterDisplayNumber;
        if (chain.instruction) {
          chain.instruction.matterDisplayNumber = matterDisplayNumber;
        }
      }
    }

    return res.json({ chain });
  } catch (err) {
    console.error(`[dubber ${reqId}] matter-chain error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.MatterChain.Lookup', reqId });
    return res.status(500).json({ error: 'Failed to look up matter chain' });
  }
});

// ── POST /api/dubberCalls/:recordingId/save-note ───────────────────────────
/**
 * Save a generated attendance note to Azure Blob Storage.
 * Body: { note: AttendanceNote, matterRef?: string }
 * Returns: { blobUrl, blobName }
 */
router.post('/dubberCalls/:recordingId/save-note', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const { note, matterRef } = req.body || {};
    if (!note || !note.attendanceNote) return res.status(400).json({ error: 'Missing attendance note content' });

    const client = getAttendanceBlobClient();
    const containerClient = client.getContainerClient(ATTENDANCE_BLOB_CONTAINER);
    await containerClient.createIfNotExists();

    const datePrefix = (note.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const blobName = `${datePrefix}/${recordingId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const payload = {
      recordingId,
      matterRef: matterRef || null,
      savedAt: new Date().toISOString(),
      savedBy: req.headers['x-user-initials'] || null,
      note,
    };
    const content = JSON.stringify(payload, null, 2);

    await blockBlobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });

    // ── Index in SQL for fast lookups ──
    try {
      const pool = await instrPool();
      const savedBy = String(req.headers['x-user-initials'] || '').trim().toUpperCase() || 'SYS';
      const callDate = note.date || null;
      const callDuration = note.duration ? Math.ceil(note.duration * 60) : null;
      const partiesFrom = note.parties?.from || null;
      const partiesTo = note.parties?.to || null;
      const summary = (note.summary || '').slice(0, 500) || null;
      const topicsJson = note.topics && note.topics.length > 0 ? JSON.stringify(note.topics) : null;
      const actionItemsJson = note.actionItems && note.actionItems.length > 0 ? JSON.stringify(note.actionItems) : null;

      await pool.request()
        .input('recording_id', sql.NVarChar, recordingId)
        .input('matter_ref', sql.NVarChar, matterRef || null)
        .input('instruction_ref', sql.NVarChar, null)
        .input('saved_by', sql.NVarChar, savedBy)
        .input('call_date', sql.Date, callDate)
        .input('call_duration_seconds', sql.Int, callDuration)
        .input('parties_from', sql.NVarChar, partiesFrom)
        .input('parties_to', sql.NVarChar, partiesTo)
        .input('summary', sql.NVarChar, summary)
        .input('topics_json', sql.NVarChar, topicsJson)
        .input('action_items_json', sql.NVarChar, actionItemsJson)
        .input('blob_name', sql.NVarChar, blobName)
        .query(`
          MERGE dbo.dubber_attendance_notes AS target
          USING (SELECT @recording_id AS recording_id) AS source
          ON target.recording_id = source.recording_id
          WHEN MATCHED THEN UPDATE SET
            matter_ref = @matter_ref,
            saved_by = @saved_by,
            saved_at = SYSDATETIMEOFFSET(),
            call_date = @call_date,
            call_duration_seconds = @call_duration_seconds,
            parties_from = @parties_from,
            parties_to = @parties_to,
            summary = @summary,
            topics_json = @topics_json,
            action_items_json = @action_items_json,
            blob_name = @blob_name
          WHEN NOT MATCHED THEN INSERT
            (recording_id, matter_ref, instruction_ref, saved_by, call_date, call_duration_seconds,
             parties_from, parties_to, summary, topics_json, action_items_json, blob_name)
          VALUES
            (@recording_id, @matter_ref, @instruction_ref, @saved_by, @call_date, @call_duration_seconds,
             @parties_from, @parties_to, @summary, @topics_json, @action_items_json, @blob_name);
        `);
    } catch (sqlErr) {
      // Non-fatal: blob save succeeded, SQL index is best-effort
      console.warn(`[dubber ${reqId}] SQL index for attendance note failed:`, sqlErr.message);
    }

    const durationMs = Date.now() - started;
    trackEvent('Dubber.AttendanceNote.Saved', { reqId, recordingId, matterRef: matterRef || '', blobName, durationMs: String(durationMs) });
    try { await deleteCachePattern('home-journey:*'); } catch { /* non-fatal */ }

    return res.json({ ok: true, blobUrl: blockBlobClient.url, blobName });
  } catch (err) {
    console.error(`[dubber ${reqId}] save-note error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.Save', reqId });
    return res.status(500).json({ error: 'Failed to save attendance note' });
  }
});

// ── Prospect AC contact-id resolver (feature-flagged) ──────────────────────
// Mirrors src/utils/resolveActiveCampaignContactId.ts precedence:
//   enquiries.acid → Deals.ProspectId
async function resolveProspectAcContactId(enquiryId) {
  if (!enquiryId) return { acContactId: null, source: null };
  try {
    const pool = await instrPool();
    // Try new-space enquiries.acid first
    try {
      const acidResult = await pool.request()
        .input('id', sql.Int, Number(enquiryId))
        .query('SELECT TOP 1 acid FROM dbo.enquiries WHERE id = @id');
      const acid = acidResult?.recordset?.[0]?.acid;
      if (acid != null && String(acid).trim() && String(acid).trim() !== '0') {
        return { acContactId: String(acid).trim(), source: 'acid' };
      }
    } catch (e) {
      // table/column might differ in this env — swallow and fall through
    }
    // Fallback: Deals.ProspectId by enquiry id
    try {
      const dealResult = await pool.request()
        .input('id', sql.NVarChar, String(enquiryId))
        .query("SELECT TOP 1 ProspectId FROM dbo.Deals WHERE CAST(ProspectId AS NVARCHAR(50)) = @id ORDER BY DealId DESC");
      const pid = dealResult?.recordset?.[0]?.ProspectId;
      if (pid != null && String(pid).trim()) {
        return { acContactId: String(pid).trim(), source: 'deal-prospect' };
      }
    } catch (e) {
      // non-fatal
    }
  } catch (e) {
    // pool unavailable — non-fatal
  }
  return { acContactId: null, source: null };
}

// Fire-and-log AC contact note. Non-fatal. Returns { ok, error? }.
async function postAcContactNote({ acContactId, noteBody, reqId }) {
  if (!acContactId || !noteBody) return { ok: false, error: 'missing-inputs' };
  const startedAc = Date.now();
  try {
    const [apiToken, baseUrlSecret] = await Promise.all([
      getSecret('ac-automations-apitoken').catch(() => null),
      getSecret('ac-base-url').catch(() => null),
    ]);
    if (!apiToken) return { ok: false, error: 'no-token' };
    const baseUrl = String(baseUrlSecret || 'https://helix-law54533.api-us1.com/api/3').replace(/\/$/, '');
    const body = JSON.stringify({ note: { note: String(noteBody).slice(0, 4000), relid: String(acContactId), reltype: 'Subscriber' } });
    const urlObj = new URL(`${baseUrl}/notes`);
    const result = await new Promise((resolve) => {
      const request = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Api-Token': apiToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (r) => {
        let d = ''; r.on('data', c => { d += c; });
        r.on('end', () => {
          const status = r.statusCode || 0;
          if (status >= 200 && status < 300) resolve({ ok: true });
          else resolve({ ok: false, error: `status ${status}: ${d.slice(0, 180)}` });
        });
      });
      request.on('error', (e) => resolve({ ok: false, error: e?.message || 'network-error' }));
      request.setTimeout(10000, () => { request.destroy(); resolve({ ok: false, error: 'timeout' }); });
      request.write(body); request.end();
    });
    const durationMs = Date.now() - startedAc;
    if (result.ok) {
      trackEvent('ActiveCampaign.Note.Posted', { reqId, acContactId: String(acContactId), durationMs: String(durationMs) });
    } else {
      trackEvent('ActiveCampaign.Note.Failed', { reqId, acContactId: String(acContactId), error: String(result.error || '').slice(0, 180) });
    }
    return result;
  } catch (e) {
    trackEvent('ActiveCampaign.Note.Failed', { reqId, acContactId: String(acContactId), error: e?.message || 'exception' });
    return { ok: false, error: e?.message || 'exception' };
  }
}

// ── POST /api/dubberCalls/:recordingId/save-prospect-note ──────────────────
/**
 * File a telephone attendance note against a prospect's doc-workspace.
 *
 * Body: {
 *   note: AttendanceNote,
 *   enquiryId: number | string,
 *   passcode?: string,        // auto-resolved via resolveLatestWorkspace if missing
 *   contactName?: string,     // used for filename
 * }
 * Returns: { ok, blobName, sasUrl, acSynced?: boolean, acError?: string }
 *
 * The recordingId param may be a real Dubber recording id OR a synthetic
 * "manual-<uuid>" when the user files a standalone note without a call.
 */
router.post('/dubberCalls/:recordingId/save-prospect-note', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const { note, enquiryId: enquiryIdRaw, passcode: passcodeRaw, contactName: contactNameRaw } = req.body || {};
    if (!note || !note.attendanceNote) return res.status(400).json({ error: 'Missing attendance note content' });

    const enquiryId = Number.parseInt(String(enquiryIdRaw ?? ''), 10);
    if (!Number.isFinite(enquiryId) || enquiryId <= 0) {
      return res.status(400).json({ error: 'Missing or invalid enquiryId' });
    }

    // Load the shared helpers from doc-workspace.js.
    const docWorkspace = require('./doc-workspace');
    const internals = docWorkspace.internals;
    if (!internals) {
      return res.status(500).json({ error: 'doc-workspace internals unavailable' });
    }
    const { getBlobServiceClient: getDwBlobClient, resolveLatestWorkspace, generateBlobReadSasUrl, PROSPECT_CONTAINER } = internals;

    const svc = getDwBlobClient();
    const containerClient = svc.getContainerClient(PROSPECT_CONTAINER);

    // Resolve passcode if not supplied.
    let passcode = String(passcodeRaw || '').trim();
    if (!passcode) {
      const workspace = await resolveLatestWorkspace(containerClient, enquiryId);
      passcode = workspace?.passcode || '';
    }
    if (!passcode) {
      return res.status(404).json({ error: 'No workspace found for this enquiry. Create a doc-request workspace first.' });
    }

    // Build docx.
    const docxBuffer = await generateAttendanceNoteDocx(note);

    // Filename: "Attendance Note - YYYYMMDD - {contactName}.docx"
    const datePart = (note.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const safeContactName = String(contactNameRaw || note.parties?.from || 'Prospect')
      .replace(/[^\w\-() ]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    const filename = `Attendance_Note-${datePart}-${safeContactName}.docx`;
    const subfolder = 'Telephone Attendance Notes';

    // Ensure keep marker (idempotent).
    const keepBlobName = `enquiries/${enquiryId}/${passcode}/${subfolder}/.keep`;
    try {
      const keepBlob = containerClient.getBlockBlobClient(keepBlobName);
      const exists = await keepBlob.exists();
      if (!exists) {
        await keepBlob.uploadData(Buffer.from(''), { blobHTTPHeaders: { blobContentType: 'text/plain' } });
      }
    } catch { /* non-fatal */ }

    const blobName = `enquiries/${enquiryId}/${passcode}/${subfolder}/${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(docxBuffer, {
      blobHTTPHeaders: { blobContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      metadata: {
        enquiryId: String(enquiryId),
        passcode,
        subfolder,
        documentType: 'telephone-attendance-note',
        uploadedBy: String(req.headers['x-user-initials'] || 'Hub'),
        uploadedAt: new Date().toISOString(),
        recordingId,
        source: 'hub-call-centre',
      },
    });

    const sasUrl = await generateBlobReadSasUrl(PROSPECT_CONTAINER, blobName, filename, 60);

    // Optional: AC contact note (feature-flagged).
    let acSynced;
    let acError;
    if (String(process.env.ENABLE_AC_CONTACT_NOTES || '').toLowerCase() === 'true') {
      const { acContactId } = await resolveProspectAcContactId(enquiryId);
      if (acContactId) {
        const noteBody = `${(note.summary || '').trim()}\n\n${(note.attendanceNote || '').trim()}`.trim();
        const acResult = await postAcContactNote({ acContactId, noteBody, reqId });
        acSynced = !!acResult.ok;
        if (!acResult.ok) acError = String(acResult.error || '').slice(0, 180);
      } else {
        acSynced = false;
        acError = 'no-contact-id';
      }
    }

    const durationMs = Date.now() - started;
    trackEvent('Dubber.ProspectNote.Saved', {
      reqId,
      recordingId,
      enquiryId: String(enquiryId),
      passcode,
      blobName,
      durationMs: String(durationMs),
      acSynced: acSynced == null ? '' : String(acSynced),
    });
    trackMetric('Dubber.ProspectNote.Duration', durationMs, { operation: 'save-prospect-note' });

    return res.json({
      ok: true,
      blobName,
      sasUrl,
      filename,
      subfolder,
      acSynced,
      acError,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] save-prospect-note error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.ProspectNote.Save', reqId });
    trackEvent('Dubber.ProspectNote.Failed', { reqId, error: err?.message || 'unknown' });
    return res.status(500).json({ error: 'Failed to save prospect attendance note' });
  }
});

// ── POST /api/dubberCalls/:recordingId/upload-note-nd ──────────────────────
/**
 * Generate a .docx attendance note and upload it to the matter's ND workspace.
 * Body: { note: AttendanceNote, matterRef: string (e.g. "00123-45678") }
 * Resolves ND workspace → finds 'Attendance Notes' folder → uploads docx.
 */
router.post('/dubberCalls/:recordingId/upload-note-nd', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const { note, matterRef } = req.body || {};
    if (!note || !note.attendanceNote) return res.status(400).json({ error: 'Missing attendance note content' });
    if (!matterRef) return res.status(400).json({ error: 'Missing matterRef for ND upload' });

    // Parse matterRef into clientId / matterKey for ND workspace lookup
    // Standard Clio display numbers: "00123-45678" → clientId=00123, matterKey=45678
    // Non-standard (admin, custom): "HELIX01-01" → need Clio lookup to find real clientId
    const workspaceRefResolution = await resolveNdWorkspaceRef(matterRef);
    const refStr = workspaceRefResolution.resolvedRef;
    let clientId, matterKey;
    // Try splitting on last hyphen (clientId-matterKey pattern)
    const hyphenIdx = refStr.lastIndexOf('-');
    if (hyphenIdx > 0) {
      clientId = refStr.slice(0, hyphenIdx);
      matterKey = refStr.slice(hyphenIdx + 1);
    } else {
      return res.status(400).json({ error: `Cannot parse matterRef into clientId/matterKey (${String(matterRef).trim()})` });
    }

    // Step 1: Generate docx
    const docxBuffer = await generateAttendanceNoteDocx(note);
    const dateStr = (note.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const from = (note.parties?.from || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
    const fileName = `Attendance Note - ${dateStr} - ${from}.docx`;

    // Step 2: Resolve ND workspace — try hyphen-split first, fall back to Clio lookup
    const accessToken = await getNdAccessToken();
    const cabinet = await getSecret('nd-cabinet');
    let workspacePath = `/v1/Workspace/${encodeURIComponent(cabinet)}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}`;
    let workspacePayload;
    try {
      workspacePayload = await ndApiRequest(`${workspacePath}/info`, accessToken);
    } catch (wsErr) {
      // Hyphen-split failed — try resolving via Clio to get real client ID
      // e.g. "HELIX01-01" → Clio client 5257922 → ND path 5257922/HELIX01-01
      console.log(`[dubber ${reqId}] ND workspace not found at ${clientId}/${matterKey}, trying Clio lookup for "${refStr}"`);
      try {
        const clioToken = await getClioAccessToken();
        const clioRes = await fetch(`${CLIO_API_BASE}/matters.json?fields=id,display_number,client{id}&query=${encodeURIComponent(refStr)}&limit=5`, {
          headers: { Authorization: `Bearer ${clioToken}` },
        });
        if (clioRes.ok) {
          const clioData = await clioRes.json();
          const match = (clioData.data || []).find(m => String(m.display_number || '').toLowerCase() === refStr.toLowerCase());
          if (match?.client?.id) {
            clientId = String(match.client.id);
            matterKey = match.display_number || refStr;
            workspacePath = `/v1/Workspace/${encodeURIComponent(cabinet)}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}`;
            console.log(`[dubber ${reqId}] Clio resolved: clientId=${clientId}, matterKey=${matterKey}`);
            workspacePayload = await ndApiRequest(`${workspacePath}/info`, accessToken);
          } else {
            return res.status(404).json({ error: `ND workspace not found for ${refStr} (Clio lookup found no matching matter)` });
          }
        } else {
          return res.status(404).json({ error: `ND workspace not found for ${refStr}: ${wsErr.message}` });
        }
      } catch (fallbackErr) {
        console.warn(`[dubber ${reqId}] ND Clio-fallback also failed:`, fallbackErr.message || fallbackErr);
        return res.status(404).json({ error: `ND workspace not found for ${refStr}: ${fallbackErr.message || wsErr.message}` });
      }
    }
    const workspaceId = workspacePayload?.standardAttributes?.envId || workspacePayload?.standardAttributes?.id || workspacePayload?.id || workspacePayload?.EnvId;
    if (!workspaceId) return res.status(404).json({ error: `No workspace ID resolved for ${refStr}`, workspaceKeys: Object.keys(workspacePayload || {}), stdKeys: Object.keys(workspacePayload?.standardAttributes || {}) });
    console.log(`[dubber ${reqId}] Workspace envId resolved: ${workspaceId}`);

    // Step 3: Find target folder in the ND workspace
    // The container summary returns top-level folders under Results. Each has a DocId or envId
    // that can be used as a destination. The workspace .nev is NOT a valid folder — only use
    // folder DocIds from the summary or its sub-containers.
    //
    // DEV OVERRIDE: While testing, all uploads go to "luke-sandbox" in HELIX01-01.
    // TODO: Remove this override when ready for production — search for attendanceFolderNames.
    const DEV_SANDBOX_OVERRIDE = true; // flip to false to use real attendance folder matching
    const attendanceFolderNames = ['attendance', 'file note']; // production folder name matches
    const sandboxFolderNames = ['luke-sandbox'];               // dev testing folder
    const targetFolderNames = DEV_SANDBOX_OVERRIDE ? sandboxFolderNames : attendanceFolderNames;

    let attendanceFolderId = null;
    try {
      const summary = await ndApiRequest(`/v2/container/${encodeURIComponent(workspaceId)}/summary/containers?filter=extension`, accessToken);
      const summaryResults = summary?.Results || summary?.results || (Array.isArray(summary) ? summary : []);
      console.log(`[dubber ${reqId}] Container summary: ${summaryResults.length} top-level containers (target: ${targetFolderNames.join('|')})`);

      // Search top-level containers for target folder
      for (const c of summaryResults) {
        const cName = String(c?.Attributes?.Name || c?.attributes?.name || c?.name || c?.Name || '').toLowerCase();
        const cId = c?.DocId || c?.docId || c?.Attributes?.DocId || c?.envId || c?.EnvId || c?.id;
        if (targetFolderNames.some(n => cName.includes(n))) {
          attendanceFolderId = cId;
          console.log(`[dubber ${reqId}] Found target folder at top level: "${cName}" → ${attendanceFolderId}`);
          break;
        }
      }

      // If not at top level, drill into each container's subfolders
      if (!attendanceFolderId) {
        for (const c of summaryResults) {
          const cId = c?.DocId || c?.docId || c?.Attributes?.DocId || c?.envId || c?.EnvId || c?.id;
          if (!cId) continue;
          try {
            const subs = await ndApiRequest(`/v2/container/${encodeURIComponent(cId)}/sub/?recursive=true&select=StandardAttributes`, accessToken);
            const subResults = subs?.Results || subs?.results || (Array.isArray(subs) ? subs : []);
            for (const item of subResults) {
              const name = String(item?.Attributes?.Name || item?.attributes?.name || item?.name || item?.Name || '').toLowerCase();
              const docId = item?.DocId || item?.docId || item?.Attributes?.DocId || item?.id;
              if (targetFolderNames.some(n => name.includes(n))) {
                attendanceFolderId = docId;
                console.log(`[dubber ${reqId}] Found target folder in sub-container: "${name}" → ${attendanceFolderId}`);
                break;
              }
            }
            if (attendanceFolderId) break;
          } catch (subErr) {
            // Non-fatal — try next container
          }
        }
      }

      // If still nothing, use first container as fallback (NOT the workspace .nev)
      if (!attendanceFolderId && summaryResults.length > 0) {
        const fallback = summaryResults[0];
        attendanceFolderId = fallback?.DocId || fallback?.docId || fallback?.Attributes?.DocId || fallback?.envId || fallback?.EnvId || fallback?.id;
        console.log(`[dubber ${reqId}] No target folder found, using first container as fallback: ${attendanceFolderId}`);
      }
    } catch (wsListErr) {
      console.warn(`[dubber ${reqId}] ND container listing failed:`, wsListErr.message);
    }

    // Step 4: Create blank document then upload content (matches Power Automate ND flow)
    // CRITICAL: destination MUST be a folder/container DocId, NOT the workspace .nev envelope
    if (!attendanceFolderId) {
      return res.status(404).json({ error: `No valid folder found in ND workspace for ${refStr} (workspace=${workspaceId}). Cannot upload to workspace root.` });
    }
    console.log(`[dubber ${reqId}] ND upload target: ${attendanceFolderId} (workspace=${workspaceId})`);
    const baseUrl = await getSecret('nd-baseurl');
    const ndBase = String(baseUrl).replace(/\/$/, '');
    const docName = path.parse(fileName).name;
    const docExt = path.extname(fileName).replace(/^\./, '') || 'docx';

    // 4a: Create blank document with metadata
    const createBodyStr = `return=full&cabinet=${encodeURIComponent(cabinet)}&profile=${encodeURIComponent(JSON.stringify([{ id: 3, value: 'Telephone Attendance Notes' }]))}&action=create&destination=${encodeURIComponent(attendanceFolderId)}`;
    const createUrl = new URL(`${ndBase}/v1/Document?name=${encodeURIComponent(docName)}&extension=${encodeURIComponent(docExt)}`);

    const createResult = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: createUrl.hostname, path: createUrl.pathname + createUrl.search, method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(createBodyStr),
          Accept: 'application/json',
        },
      }, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`ND document create failed (${response.statusCode}): ${data}`));
            return;
          }
          try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
        });
      });
      request.on('error', reject);
      request.setTimeout(20000, () => { request.destroy(); reject(new Error('ND create timeout')); });
      request.write(createBodyStr);
      request.end();
    });

    const ndDocId = createResult?.standardAttributes?.id || createResult?.DocId || createResult?.docId || createResult?.id || createResult?.standardAttributes?.envId || createResult?.EnvId;
    console.log(`[dubber ${reqId}] ND document create response keys:`, JSON.stringify(Object.keys(createResult || {})));
    if (!ndDocId) {
      console.error(`[dubber ${reqId}] ND document create returned no ID. Full response:`, JSON.stringify(createResult));
      throw new Error('ND document creation returned no document ID');
    }
    console.log(`[dubber ${reqId}] ND blank document created: ${ndDocId}`);

    // 4b: Upload docx content to the blank document
    const putUrl = new URL(`${ndBase}/v1/Document/${encodeURIComponent(ndDocId)}`);
    const uploadResult = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: putUrl.hostname, path: putUrl.pathname + putUrl.search, method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Length': docxBuffer.length,
          Accept: 'application/json',
        },
      }, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`ND content upload failed (${response.statusCode}): ${data}`));
            return;
          }
          try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
        });
      });
      request.on('error', reject);
      request.setTimeout(30000, () => { request.destroy(); reject(new Error('ND upload timeout')); });
      request.write(docxBuffer);
      request.end();
    });

    const durationMs = Date.now() - started;
    trackEvent('Dubber.AttendanceNote.UploadedND', {
      reqId, recordingId, matterRef: refStr, requestedMatterRef: workspaceRefResolution.requestedRef, workspaceRefSource: workspaceRefResolution.source, fileName,
      ndDocId,
      attendanceFolderId: attendanceFolderId || 'workspace-root',
      durationMs: String(durationMs),
    });
    trackMetric('Dubber.AttendanceNote.UploadDuration', durationMs, { recordingId });

    // ── Update SQL index with ND upload status ──
    try {
      const pool = await instrPool();
      await pool.request()
        .input('recording_id', sql.NVarChar, recordingId)
        .input('nd_doc_id', sql.NVarChar, ndDocId)
        .input('nd_file_name', sql.NVarChar, fileName)
        .input('matter_ref', sql.NVarChar, refStr)
        .query(`
          UPDATE dbo.dubber_attendance_notes
          SET uploaded_nd = 1,
              nd_doc_id = @nd_doc_id,
              nd_file_name = @nd_file_name,
              matter_ref = @matter_ref
          WHERE recording_id = @recording_id
        `);
    } catch (sqlErr) {
      console.warn(`[dubber ${reqId}] SQL update for ND upload status failed:`, sqlErr.message);
    }

    try { await deleteCachePattern('home-journey:*'); } catch { /* non-fatal */ }

    return res.json({
      ok: true,
      fileName,
      ndDocId,
      uploadedTo: attendanceFolderId ? 'Attendance Notes folder' : 'Workspace root',
      matterRef: refStr,
      requestedMatterRef: workspaceRefResolution.requestedRef,
      workspaceRefSource: workspaceRefResolution.source,
      folderId: attendanceFolderId,
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] upload-note-nd error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.UploadND', reqId });
    return res.status(500).json({ error: 'Failed to upload attendance note to NetDocuments' });
  }
});

// ── POST /api/dubberCalls/:recordingId/clio-time-entry ─────────────────────
/**
 * Cut 3 of CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE_AND_CLIO_MIRROR.
 *
 * Writes a Clio TimeEntry activity for a call-derived attendance note. Body:
 *   {
 *     matterDisplayNumber: string,   // e.g. "00898-37693" — required unless clioMatterId provided
 *     clioMatterId?: string|number,  // if already resolved via matter-chain, skip the lookup
 *     chargeableMinutes: number,     // editable in UI; Clio stores hours to 2dp
 *     narrative: string,             // ≤ 500 chars; Clio's `note` field
 *     date: string,                  // YYYY-MM-DD (call date)
 *     userInitials: string           // fee earner's initials → Clio user id
 *   }
 *
 * Returns:
 *   200 { activityId, clioMatterId, clioUserId, quantityHours, durationMs }
 *   4xx { code, message, retriable }
 *   5xx { code, message, retriable }
 *
 * Token: per-user via `getClioAccessToken(userInitials)` (audit trail), falls
 * back to the service account if per-user creds aren't provisioned.
 *
 * Failure modes are returned as structured errors so the UI can decide whether
 * to offer a retry: token refresh failures are `retriable: true`, 4xx are
 * `retriable: false` (usually a data problem), 429 and 5xx are retriable with
 * Retry-After respected.
 */
router.post('/dubberCalls/:recordingId/clio-time-entry', async (req, res) => {
  const reqId = randomUUID();
  const started = Date.now();
  const recordingId = String(req.params.recordingId || '').trim();
  const body = req.body || {};
  const matterDisplayNumber = String(body.matterDisplayNumber || '').trim();
  const clioMatterIdInput = body.clioMatterId != null ? String(body.clioMatterId).trim() : '';
  const chargeableMinutesRaw = Number(body.chargeableMinutes);
  const narrative = String(body.narrative || '').trim();
  const date = String(body.date || '').trim();
  const userInitials = String(body.userInitials || '').trim().toUpperCase();

  if (!recordingId) return res.status(400).json({ code: 'MISSING_RECORDING_ID', message: 'Missing recordingId', retriable: false });
  if (!clioMatterIdInput && !matterDisplayNumber) {
    return res.status(400).json({ code: 'MISSING_MATTER', message: 'Provide clioMatterId or matterDisplayNumber', retriable: false });
  }
  if (!Number.isFinite(chargeableMinutesRaw) || chargeableMinutesRaw <= 0) {
    return res.status(400).json({ code: 'INVALID_CHARGEABLE_MINUTES', message: 'chargeableMinutes must be a positive number', retriable: false });
  }
  if (!narrative) return res.status(400).json({ code: 'MISSING_NARRATIVE', message: 'narrative is required', retriable: false });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ code: 'INVALID_DATE', message: 'date must be YYYY-MM-DD', retriable: false });
  if (!userInitials) return res.status(400).json({ code: 'MISSING_USER_INITIALS', message: 'userInitials is required', retriable: false });

  // Clio's `note` is capped at 500 chars per field; truncate defensively.
  const note = narrative.length > 500 ? narrative.slice(0, 500) : narrative;
  // Convert minutes → hours to 2dp (Clio's native precision).
  const quantityHours = Math.round((chargeableMinutesRaw / 60) * 100) / 100;

  trackEvent('CallCentre.TimeEntry.Started', {
    reqId,
    recordingId,
    userInitials,
    matterDisplayNumber,
    chargeableMinutes: chargeableMinutesRaw,
  });

  try {
    // 1. Resolve Clio matter id — accept caller-supplied or look up via Core Data.
    let clioMatterId = clioMatterIdInput;
    if (!clioMatterId) {
      clioMatterId = await resolveClioMatterIdFromDisplayNumber(matterDisplayNumber);
      if (!clioMatterId) {
        const err = { code: 'MATTER_NOT_FOUND', message: `No Clio matter id for display number ${matterDisplayNumber}`, retriable: false };
        trackEvent('CallCentre.TimeEntry.Failed', { reqId, ...err });
        return res.status(404).json(err);
      }
    }

    // 2. Resolve Clio user id from initials.
    let clioUserId;
    try {
      clioUserId = await getClioId(userInitials);
    } catch (teamErr) {
      console.warn(`[dubber ${reqId}] clio-time-entry: team lookup failed:`, teamErr.message);
    }
    if (!clioUserId) {
      const err = { code: 'CLIO_USER_NOT_FOUND', message: `No Clio ID in [dbo].[team] for initials ${userInitials}`, retriable: false };
      trackEvent('CallCentre.TimeEntry.Failed', { reqId, ...err });
      return res.status(404).json(err);
    }

    // 3. Get access token (per-user, falls back to service). Token failures are retriable.
    let accessToken;
    try {
      accessToken = await getClioAccessToken(userInitials);
    } catch (tokenErr) {
      const err = { code: 'CLIO_TOKEN_FAILED', message: tokenErr.message || 'Clio token refresh failed', retriable: true };
      trackException(tokenErr, { operation: 'CallCentre.TimeEntry.Token', reqId, userInitials });
      trackEvent('CallCentre.TimeEntry.Failed', { reqId, ...err });
      return res.status(502).json(err);
    }

    // 4. POST the activity.
    const payload = {
      data: {
        type: 'TimeEntry',
        date,
        quantity_in_hours: quantityHours,
        note,
        matter: { id: Number(clioMatterId) || clioMatterId },
        user: { id: Number(clioUserId) || clioUserId },
      },
    };

    const clioRes = await fetch(`${CLIO_API_BASE}/activities.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!clioRes.ok) {
      const text = await clioRes.text().catch(() => '');
      const retryAfterHeader = clioRes.headers.get('retry-after');
      const is429 = clioRes.status === 429;
      const is5xx = clioRes.status >= 500;
      const err = {
        code: is429 ? 'CLIO_RATE_LIMITED' : is5xx ? 'CLIO_SERVER_ERROR' : 'CLIO_WRITE_REJECTED',
        message: text ? text.slice(0, 500) : `Clio responded ${clioRes.status}`,
        retriable: is429 || is5xx,
        retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) || null : null,
        status: clioRes.status,
      };
      trackEvent('CallCentre.TimeEntry.Failed', { reqId, ...err, userInitials, clioMatterId: String(clioMatterId) });
      return res.status(is429 ? 429 : is5xx ? 502 : 422).json(err);
    }

    const clioJson = await clioRes.json().catch(() => ({}));
    const activityId = clioJson?.data?.id ? String(clioJson.data.id) : '';
    const durationMs = Date.now() - started;

    trackEvent('CallCentre.TimeEntry.Completed', {
      reqId,
      recordingId,
      userInitials,
      matterDisplayNumber,
      clioMatterId: String(clioMatterId),
      clioUserId: String(clioUserId),
      activityId,
      quantityHours,
      durationMs,
    });
    trackMetric('CallCentre.TimeEntry.Duration', durationMs, { operation: 'ClioTimeEntry' });

    return res.json({
      activityId,
      clioMatterId: String(clioMatterId),
      clioUserId: String(clioUserId),
      quantityHours,
      durationMs,
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] clio-time-entry error:`, err?.message || err);
    trackException(err, { operation: 'CallCentre.TimeEntry', reqId, userInitials });
    const payload = { code: 'UNEXPECTED', message: err?.message || 'Unexpected error writing Clio time entry', retriable: true };
    trackEvent('CallCentre.TimeEntry.Failed', { reqId, ...payload });
    return res.status(500).json(payload);
  }
});

// ── GET /api/dubberCalls/noted-ids ─────────────────────────────────────────
/**
 * Batch check which recording IDs have attendance notes.
 * Query: ?ids=id1,id2,id3 (comma-separated, max 200)
 * Returns: { notedIds: ['id1', 'id3'] }
 */
router.get('/dubberCalls/noted-ids', async (req, res) => {
  try {
    const raw = String(req.query.ids || '').trim();
    if (!raw) return res.json({ notedIds: [] });

    const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return res.json({ notedIds: [] });

    const pool = await instrPool();
    const request = pool.request();
    const params = [];
    ids.forEach((id, i) => {
      const param = `id${i}`;
      request.input(param, sql.NVarChar, id);
      params.push(`@${param}`);
    });

    const result = await request.query(`
      SELECT recording_id FROM dbo.dubber_attendance_notes
      WHERE recording_id IN (${params.join(',')})
    `);

    return res.json({ notedIds: result.recordset.map(r => r.recording_id) });
  } catch (err) {
    console.error('[dubber] noted-ids error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to check noted IDs' });
  }
});

// ── GET /api/dubberCalls/attendance-notes ──────────────────────────────────
/**
 * List attendance notes.
 * Query: ?initials=CS&limit=30  OR  ?matterRef=SCOTT10803-00001
 * Returns: { notes: [...] }
 */
router.get('/dubberCalls/attendance-notes', async (req, res) => {
  try {
    const initials = String(req.query.initials || '').trim().toUpperCase();
    const matterRef = String(req.query.matterRef || '').trim();
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const pool = await instrPool();
    const request = pool.request();
    request.input('limit', sql.Int, limit);

    let whereClause = '1=1';
    if (matterRef) {
      request.input('matterRef', sql.NVarChar, matterRef);
      whereClause = 'n.matter_ref = @matterRef';
    } else if (initials) {
      request.input('initials', sql.NVarChar, initials);
      whereClause = 'n.saved_by = @initials';
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        n.id, n.recording_id, n.matter_ref, n.matter_id, n.instruction_ref,
        n.saved_by, n.saved_at, n.call_date, n.call_duration_seconds,
        n.parties_from, n.parties_to, n.summary, n.topics_json,
        n.action_items_json, n.blob_name, n.uploaded_nd, n.nd_doc_id, n.nd_file_name
      FROM dbo.dubber_attendance_notes n
      WHERE ${whereClause}
      ORDER BY n.saved_at DESC
    `);

    return res.json({ notes: result.recordset });
  } catch (err) {
    console.error('[dubber] attendance-notes error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch attendance notes' });
  }
});

// ── GET /api/dubberCalls/:recordingId/saved-note ───────────────────────────
/**
 * Retrieve a single saved attendance note by recording ID.
 * Returns the full note from blob storage + SQL metadata, or null.
 */
router.get('/dubberCalls/:recordingId/saved-note', async (req, res) => {
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing recordingId' });

    const pool = await instrPool();
    const sqlResult = await pool.request()
      .input('rid', sql.NVarChar, recordingId)
      .query(`
        SELECT id, recording_id, matter_ref, saved_by, saved_at,
               call_date, summary, blob_name,
               uploaded_nd, nd_doc_id, nd_file_name
        FROM dbo.dubber_attendance_notes
        WHERE recording_id = @rid
      `);

    const row = sqlResult.recordset[0];
    if (!row) return res.json({ note: null, meta: null });

    let fullNote = null;
    if (row.blob_name) {
      try {
        const client = getAttendanceBlobClient();
        const containerClient = client.getContainerClient(ATTENDANCE_BLOB_CONTAINER);
        const blobClient = containerClient.getBlockBlobClient(row.blob_name);
        const downloadResponse = await blobClient.download(0);
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(chunk);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString());
        fullNote = parsed.note || parsed;
      } catch (blobErr) {
        console.warn(`[dubber] saved-note blob fetch failed for ${recordingId}:`, blobErr.message);
      }
    }

    return res.json({
      note: fullNote,
      meta: {
        id: row.id,
        recording_id: row.recording_id,
        matter_ref: row.matter_ref,
        saved_by: row.saved_by,
        saved_at: row.saved_at,
        uploaded_nd: !!row.uploaded_nd,
        nd_file_name: row.nd_file_name,
      },
    });
  } catch (err) {
    console.error('[dubber] saved-note error:', err?.message || err);
    trackException(err, { operation: 'Dubber.SavedNote.Fetch' });
    return res.status(500).json({ error: 'Failed to fetch saved note' });
  }
});

module.exports = router;
