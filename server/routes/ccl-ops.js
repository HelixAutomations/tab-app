/**
 * CCL Operations — support tickets, Clio upload, NetDocuments upload.
 *
 * POST /api/ccl-ops/report     → Submit a CCL support ticket (→ tech_problems + Asana)
 * POST /api/ccl-ops/upload-clio → Upload generated .docx to Clio matter (stub)
 * POST /api/ccl-ops/upload-nd   → Upload generated .docx to ND workspace (stub)
 * GET  /api/ccl-ops/integrations → Check which integrations are available for a matter
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { trackEvent, trackException } = require('../utils/appInsights');

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


// ─── Clio Document Upload (Stub) ─────────────────────────────────────────────
// Will upload a generated CCL .docx to the Clio matter's documents.
// Phase: awaiting integration testing.

router.post('/upload-clio', async (req, res) => {
  const { matterId, matterDisplayNumber, clioMatterId, fileName } = req.body;

  if (!clioMatterId) {
    return res.status(400).json({ ok: false, error: 'Clio matter ID is required. Run integration check first.' });
  }

  try {
    // Locate the generated .docx file
    const CCL_DIR = path.join(process.cwd(), 'build', 'ccls');
    const docxPath = path.join(CCL_DIR, fileName || `CCL-${matterDisplayNumber || matterId || 'draft'}.docx`);

    if (!fs.existsSync(docxPath)) {
      return res.status(404).json({ ok: false, error: 'Document not found. Generate the .docx first.' });
    }

    // TODO: Phase 2 — Clio v4 document upload
    // Uses POST /api/v4/documents.json with multipart form data:
    //   - document[name]: fileName
    //   - document[parent][id]: clioMatterId
    //   - document[parent][type]: "Matter"
    //   - file: the .docx binary
    //
    // Token: getClioAccessToken() from resources-core.js pattern
    // Reference: https://docs.developers.clio.com/api-reference/#operation/Document#create

    trackEvent('CCL.Upload.Clio.Attempted', {
      matterId: matterDisplayNumber || matterId,
      clioMatterId,
      status: 'stub',
    });

    return res.status(501).json({
      ok: false,
      error: 'Clio upload is not yet active. The document has been generated — upload it manually to Clio for now.',
      clioMatterId,
      docxPath: `/ccls/${path.basename(docxPath)}`,
    });
  } catch (error) {
    trackException(error, { operation: 'CCL.Upload.Clio', matterId: matterDisplayNumber || matterId });
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
    const CCL_DIR = path.join(process.cwd(), 'build', 'ccls');
    const docxPath = path.join(CCL_DIR, fileName || `CCL-${matterDisplayNumber || matterId || 'draft'}.docx`);

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
