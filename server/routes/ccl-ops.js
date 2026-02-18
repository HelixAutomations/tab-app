/**
 * CCL Operations — support tickets, Clio upload, NetDocuments upload.
 *
 * POST /api/ccl-ops/report     → Submit a CCL support ticket (→ tech_problems + Asana)
 * POST /api/ccl-ops/upload-clio → Upload generated .docx to Clio matter (3-step presigned URL)
 * POST /api/ccl-ops/upload-nd   → Upload generated .docx to ND workspace (stub)
 * GET  /api/ccl-ops/integrations → Check which integrations are available for a matter
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { generateWordFromJson } = require('../utils/wordGenerator.js');
const { getCclContentById } = require('../utils/cclPersistence');

// CCL docx lives in public/ccls/{matterId}.docx (matches ccl.js)
const CCL_DIR = path.join(process.cwd(), 'public', 'ccls');

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
      await generateWordFromJson(draftJson, docxPath);
      // Also persist the merged JSON so disk stays in sync
      fs.writeFileSync(jsonFilePath, JSON.stringify(draftJson, null, 2));
      console.log('[CCL Upload Clio] Docx regenerated successfully from', regenSource, 'fields.');
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


// ─── NetDocuments Upload (Stub) ──────────────────────────────────────────────
// Will upload a generated CCL .docx to the ND workspace for this matter.
// Phase: awaiting integration testing.

router.post('/upload-nd', async (req, res) => {
  const { matterId, matterDisplayNumber, ndWorkspaceId, fileName } = req.body;

  if (!ndWorkspaceId) {
    return res.status(400).json({ ok: false, error: 'NetDocuments workspace ID is required. Run integration check first.' });
  }

  try {
    const docxPath = path.join(CCL_DIR, `${matterId || matterDisplayNumber || 'draft'}.docx`);

    if (!fs.existsSync(docxPath)) {
      return res.status(404).json({ ok: false, error: 'Document not found. Generate the .docx first.' });
    }

    // TODO: Phase 2 — NetDocuments upload via ndApiRequest
    // Uses POST /v2/content/upload-document with multipart form:
    //   - id: ndWorkspaceId (destination container)
    //   - file: the .docx binary
    //   - DocProfile fields: name, extension, cabinet
    //
    // Token: getNetDocumentsAccessToken() from resources-core.js
    // Helper: ndApiRequest() already supports POST with body
    // Reference: NetDocuments REST API v2 documentation

    trackEvent('CCL.Upload.ND.Attempted', {
      matterId: matterDisplayNumber || matterId,
      ndWorkspaceId,
      status: 'stub',
    });

    return res.status(501).json({
      ok: false,
      error: 'NetDocuments upload is not yet active. The document has been generated — upload it manually to NetDocuments for now.',
      ndWorkspaceId,
      docxPath: `/ccls/${path.basename(docxPath)}`,
    });
  } catch (error) {
    trackException(error, { operation: 'CCL.Upload.ND', matterId: matterDisplayNumber || matterId });
    return res.status(500).json({ ok: false, error: error.message || 'NetDocuments upload failed.' });
  }
});


module.exports = router;
