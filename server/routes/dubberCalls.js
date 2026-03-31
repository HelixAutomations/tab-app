/* eslint-disable no-console */
const express = require('express');
const sql = require('mssql');
const https = require('https');
const { randomUUID } = require('crypto');
const opLog = require('../utils/opLog');
const { getPool } = require('../utils/db');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { getClioId } = require('../utils/teamLookup');
const { chatCompletion } = require('../utils/aiClient');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel,
} = require('docx');

const router = express.Router();

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
  const { DefaultAzureCredential } = require('@azure/identity');
  _blobClient = new BlobServiceClient(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] }));
  return _blobClient;
}

// ── NetDocuments helpers (local to this router) ────────────────────────────
let _ndTokenCache = null;

async function getNdAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_ndTokenCache && _ndTokenCache.exp > now + 90) return _ndTokenCache.token;

  const [authUrl, basicKey, clientId, clientSecret] = await Promise.all([
    getSecret('nd-authurl'), getSecret('nd-basic-key'),
    getSecret('nd-serviceaccount-clientid'), getSecret('nd-serviceaccount-clientsecret'),
  ]);
  const bodyStr = `grant_type=client_credentials&scope=datatables_full+full&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const urlObj = new URL(String(authUrl));
  const tokenData = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'POST',
      headers: { Authorization: `Basic ${basicKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr) },
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

async function ndApiRequest(path, accessToken) {
  const baseUrl = await getSecret('nd-baseurl');
  const urlObj = new URL(`${String(baseUrl).replace(/\/$/, '')}${path}`);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; }); res.on('end', () => {
        if ((res.statusCode || 500) >= 400) { reject(new Error(d || `ND API ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(d)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ND API timeout')); });
    req.end();
  });
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
function instrPool() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
}

/** Get the Core Data DB pool (enquiries live here). */
function corePool() {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
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
  try {
    const recordingId = String(req.params.recordingId || '').trim();
    if (!recordingId) {
      return res.status(400).json({ error: 'Missing recordingId' });
    }

    const pool = await instrPool();

    // Fetch sentences + recording meta in parallel
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
          SELECT document_sentiment_score, ai_document_sentiment, document_emotion_json,
                 from_party, from_label, to_party, to_label, call_type, duration_seconds,
                 start_time_utc, matched_team_initials, channel
          FROM dbo.dubber_recordings
          WHERE recording_id = @rid
        `),
      pool.request()
        .input('rid', sql.NVarChar, recordingId)
        .query(`
          SELECT summary_source, summary_type, summary_text
          FROM dbo.dubber_recording_summaries
          WHERE recording_id = @rid
        `),
    ]);

    return res.json({
      recordingId,
      sentenceCount: sentenceResult.recordset.length,
      sentences: sentenceResult.recordset,
      recording: recResult.recordset[0] || null,
      summaries: summaryResult.recordset,
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] transcript error:`, err?.message || err);
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
 */
async function resolvePhoneNames(normDigitsArr) {
  if (!normDigitsArr.length) return {};
  const map = {};

  // Build LIKE patterns from normalised digits
  const patterns = normDigitsArr.map(d => `%${d.slice(-7)}%`); // last 7 digits for reliable LIKE

  try {
    // ── 1. Core Data DB — enquiries.Phone_Number ──
    const mainConnStr = process.env.SQL_CONNECTION_STRING;
    if (mainConnStr) {
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
      for (const row of result.recordset) {
        const norm = normDigits(row.Phone_Number);
        const name = [row.First_Name, row.Last_Name].filter(Boolean).join(' ');
        if (name && norm) map[norm] = { name, source: 'enquiry', ref: row.ID ? String(row.ID) : null, areaOfWork: row.Area_of_Work || null };
      }
    }
  } catch (err) {
    console.warn('[dubber] Core Data phone resolve failed:', err.message);
  }

  try {
    // ── 2. Instructions DB — dbo.enquiries.phone ──
    const pool = await instrPool();
    const req = pool.request();
    const orClauses = [];
    // Only resolve digits not already found
    const remaining = normDigitsArr.filter(d => !map[d]);
    if (remaining.length > 0) {
      remaining.forEach((d, i) => {
        const param = `ip${i}`;
        req.input(param, sql.NVarChar, `%${d.slice(-7)}%`);
        orClauses.push(`REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
      });
      const result = await req.query(`
        SELECT id, first AS First_Name, last AS Last_Name, phone, aow
        FROM dbo.enquiries
        WHERE ${orClauses.join(' OR ')}
      `);
      for (const row of result.recordset) {
        const norm = normDigits(row.phone);
        const name = [row.First_Name, row.Last_Name].filter(Boolean).join(' ');
        if (name && norm) map[norm] = { name, source: 'enquiry-v2', ref: row.id ? String(row.id) : null, areaOfWork: row.aow || null };
      }
    }
  } catch (err) {
    console.warn('[dubber] Instructions DB phone resolve failed:', err.message);
  }

  try {
    // ── 3. Instructions DB — Instructions.Phone ──
    const pool = await instrPool();
    const req = pool.request();
    const remaining = normDigitsArr.filter(d => !map[d]);
    if (remaining.length > 0) {
      const orClauses = [];
      remaining.forEach((d, i) => {
        const param = `xp${i}`;
        req.input(param, sql.NVarChar, `%${d.slice(-7)}%`);
        orClauses.push(`REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
      });
      const result = await req.query(`
        SELECT InstructionRef, FirstName, LastName, Phone
        FROM Instructions
        WHERE ${orClauses.join(' OR ')}
      `);
      for (const row of result.recordset) {
        const norm = normDigits(row.Phone);
        const name = [row.FirstName, row.LastName].filter(Boolean).join(' ');
        if (name && norm) map[norm] = { name, source: 'instructions', ref: row.InstructionRef || null, areaOfWork: null };
      }
    }
  } catch (err) {
    console.warn('[dubber] Instructions table phone resolve failed:', err.message);
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
        if (data.data && Array.isArray(data.data)) activities.push(...data.data);
        if (!data.meta?.paging?.next || data.data.length < limit) break;
        offset += limit;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    trackEvent('Dubber.Activities.Fetched', { reqId, initials, fetchAll: String(fetchAll), count: String(activities.length), durationMs: String(Date.now() - started) });
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

    // Build transcript text for AI
    const transcriptText = sentences.length > 0
      ? sentences.map(s => `${s.speaker}: ${s.content}`).join('\n')
      : existingSummary || 'No transcript available.';

    const fromParty = recording.from_label || recording.from_party || 'Unknown';
    const toParty = recording.to_label || recording.to_party || 'Unknown';
    const callDate = recording.start_time_utc ? new Date(recording.start_time_utc).toISOString().slice(0, 10) : 'Unknown';
    const durationMins = recording.duration_seconds ? Math.ceil(recording.duration_seconds / 60) : 0;

    const systemPrompt = `You are a legal attendance note writer for Helix Law, a UK commercial law firm. Generate a professional attendance note from the following telephone call transcript. The note should be suitable for filing in the client matter.

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

    const aiResult = await chatCompletion(systemPrompt, userPrompt, { temperature: 0.3 });

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
      },
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] attendance-note error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.Generate', reqId });
    return res.status(500).json({ error: 'Failed to generate attendance note' });
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

    // Step 1: Find enquiry by phone (Core Data)
    try {
      const coreP = await corePool();
      const eqResult = await coreP.request()
        .input('phone', sql.NVarChar, `%${norm.slice(-7)}%`)
        .query(`
          SELECT TOP 1 ID, First_Name, Last_Name, Phone_Number, Area_of_Work
          FROM enquiries
          WHERE REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', '') LIKE @phone
          ORDER BY ID DESC
        `);
      if (eqResult.recordset.length > 0) {
        const eq = eqResult.recordset[0];
        chain.enquiry = { id: eq.ID, name: [eq.First_Name, eq.Last_Name].filter(Boolean).join(' '), areaOfWork: eq.Area_of_Work };
      }
    } catch (err) {
      console.warn('[dubber] matter-chain: Core Data enquiry lookup failed:', err.message);
    }

    // Step 2: Find deal via prospect (Instructions DB)
    try {
      // Look in Instructions DB enquiries for a prospect with this phone
      const eqResult2 = await pool.request()
        .input('phone', sql.NVarChar, `%${norm.slice(-7)}%`)
        .query(`
          SELECT TOP 1 id, prospect_id, first, last, area_of_work
          FROM dbo.enquiries
          WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE @phone
          ORDER BY id DESC
        `);
      if (eqResult2.recordset.length > 0) {
        const eq2 = eqResult2.recordset[0];
        if (!chain.enquiry) {
          chain.enquiry = { id: eq2.id, name: [eq2.first, eq2.last].filter(Boolean).join(' '), areaOfWork: eq2.area_of_work };
        }
        // Find deal by prospect_id
        if (eq2.prospect_id) {
          const dealResult = await pool.request()
            .input('pid', sql.NVarChar, String(eq2.prospect_id))
            .query(`
              SELECT TOP 1 DealId, InstructionRef, Amount, ServiceDescription
              FROM Deals WHERE ProspectId = @pid ORDER BY DealId DESC
            `);
          if (dealResult.recordset.length > 0) {
            const deal = dealResult.recordset[0];
            chain.deal = { dealId: deal.DealId, instructionRef: deal.InstructionRef, amount: deal.Amount, service: deal.ServiceDescription };
          }
        }
      }
    } catch (err) {
      console.warn('[dubber] matter-chain: Instructions DB lookup failed:', err.message);
    }

    // Step 3: Find instruction + Clio matter
    try {
      // Look by phone in Instructions table directly
      const instrResult = await pool.request()
        .input('phone', sql.NVarChar, `%${norm.slice(-7)}%`)
        .query(`
          SELECT TOP 1 InstructionRef, ClientId, MatterId, FirstName, LastName, ServiceDescription, Stage
          FROM Instructions
          WHERE REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '+', ''), '-', '') LIKE @phone
          ORDER BY InstructionRef DESC
        `);
      if (instrResult.recordset.length > 0) {
        const instr = instrResult.recordset[0];
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
      // Also try via deal's InstructionRef if we found one
      if (!chain.instruction && chain.deal?.instructionRef) {
        const instrResult2 = await pool.request()
          .input('ref', sql.NVarChar, chain.deal.instructionRef)
          .query(`
            SELECT InstructionRef, ClientId, MatterId, FirstName, LastName, ServiceDescription, Stage
            FROM Instructions WHERE InstructionRef = @ref
          `);
        if (instrResult2.recordset.length > 0) {
          const instr = instrResult2.recordset[0];
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
      }
    } catch (err) {
      console.warn('[dubber] matter-chain: Instruction lookup failed:', err.message);
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

    const durationMs = Date.now() - started;
    trackEvent('Dubber.AttendanceNote.Saved', { reqId, recordingId, matterRef: matterRef || '', blobName, durationMs: String(durationMs) });

    return res.json({ ok: true, blobUrl: blockBlobClient.url, blobName });
  } catch (err) {
    console.error(`[dubber ${reqId}] save-note error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.Save', reqId });
    return res.status(500).json({ error: 'Failed to save attendance note' });
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
    // Common formats: "00123-45678", "HELIX01-00123-45678", display numbers
    const refStr = String(matterRef).trim();
    let clientId, matterKey;
    // Try splitting on last hyphen (clientId-matterKey pattern)
    const hyphenIdx = refStr.lastIndexOf('-');
    if (hyphenIdx > 0) {
      clientId = refStr.slice(0, hyphenIdx);
      matterKey = refStr.slice(hyphenIdx + 1);
    } else {
      return res.status(400).json({ error: 'Cannot parse matterRef into clientId/matterKey' });
    }

    // Step 1: Generate docx
    const docxBuffer = await generateAttendanceNoteDocx(note);
    const dateStr = (note.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const from = (note.parties?.from || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
    const fileName = `Attendance Note - ${dateStr} - ${from}.docx`;

    // Step 2: Resolve ND workspace
    const accessToken = await getNdAccessToken();
    const cabinet = await getSecret('nd-cabinet');
    const workspacePath = `/v1/Workspace/${encodeURIComponent(cabinet)}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}`;
    let workspacePayload;
    try {
      workspacePayload = await ndApiRequest(`${workspacePath}/info`, accessToken);
    } catch (wsErr) {
      return res.status(404).json({ error: `ND workspace not found for ${refStr}: ${wsErr.message}` });
    }
    const workspaceId = workspacePayload?.id || workspacePayload?.EnvId;
    if (!workspaceId) return res.status(404).json({ error: `No workspace ID resolved for ${refStr}` });

    // Step 3: List workspace contents to find Attendance Notes folder
    let attendanceFolderId = null;
    try {
      const wsContents = await ndApiRequest(`/v1/Workspace/${encodeURIComponent(cabinet)}/${encodeURIComponent(clientId)}/${encodeURIComponent(matterKey)}`, accessToken);
      const items = wsContents?.list || [];
      for (const item of items) {
        const itemId = item.envId;
        try {
          const info = await ndApiRequest(`/v2/container/${encodeURIComponent(itemId)}/info`, accessToken);
          const attrs = info?.Attributes || info?.standardAttributes || {};
          const customTitle = Array.isArray(info?.CustomAttributes)
            ? info.CustomAttributes.find(a => a?.Id === 1003)?.Value?.[0]
            : undefined;
          const name = (customTitle || attrs.Name || attrs.name || '').toLowerCase();
          const ext = String(attrs.Ext || attrs.extension || '').toLowerCase();
          if ((name.includes('attendance') || name.includes('file note')) && ext === 'ndfld') {
            attendanceFolderId = info?.EnvId || info?.DocId || itemId;
            break;
          }
        } catch { /* skip item */ }
      }
    } catch (wsListErr) {
      console.warn(`[dubber ${reqId}] ND workspace listing failed, uploading to workspace root:`, wsListErr.message);
    }

    // Step 4: Upload docx to attendance folder (or workspace root)
    const uploadTargetId = attendanceFolderId || workspaceId;
    const { boundary, body } = buildNdMultipartBody({ workspaceId: uploadTargetId, fileName, fileBuffer: docxBuffer, cabinet });
    const baseUrl = await getSecret('nd-baseurl');
    const uploadUrl = new URL(`${String(baseUrl).replace(/\/$/, '')}/v2/content/upload-document`);

    const uploadResult = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: uploadUrl.hostname, path: uploadUrl.pathname + uploadUrl.search, method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
          'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length,
        },
      }, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) { reject(new Error(data || `ND upload failed (${response.statusCode})`)); return; }
          try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
        });
      });
      request.on('error', reject);
      request.setTimeout(30000, () => { request.destroy(); reject(new Error('ND upload timeout')); });
      request.write(body); request.end();
    });

    const durationMs = Date.now() - started;
    trackEvent('Dubber.AttendanceNote.UploadedND', {
      reqId, recordingId, matterRef: refStr, fileName,
      attendanceFolderId: attendanceFolderId || 'workspace-root',
      durationMs: String(durationMs),
    });
    trackMetric('Dubber.AttendanceNote.UploadDuration', durationMs, { recordingId });

    return res.json({
      ok: true,
      fileName,
      uploadedTo: attendanceFolderId ? 'Attendance Notes folder' : 'Workspace root',
      folderId: uploadTargetId,
      ndResult: uploadResult,
    });
  } catch (err) {
    console.error(`[dubber ${reqId}] upload-note-nd error:`, err?.message || err);
    trackException(err, { operation: 'Dubber.AttendanceNote.UploadND', reqId });
    return res.status(500).json({ error: 'Failed to upload attendance note to NetDocuments' });
  }
});

module.exports = router;
