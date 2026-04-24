/**
 * Notable Case Info proxy + audit log.
 *
 * Forwards the payload to the downstream Azure Function configured via
 *   REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH
 *   REACT_APP_INSERT_NOTABLE_CASE_INFO_CODE
 * and records the submission via formSubmissionLog so it appears in the
 * FormsHub rail alongside other bespoke forms.
 *
 * The proxy is deliberately thin: it never transforms the payload, it just
 * observes the outcome. Persistence is best-effort — audit log failures
 * never fail the user submission.
 */

const express = require('express');
const {
  recordSubmission,
  recordStep,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');
const { trackException } = require('../utils/appInsights');

const router = express.Router();

function resolveDownstreamUrl() {
  const path = (process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH || '').replace(/^\/+/, '');
  const code = process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_CODE;
  const host = process.env.REACT_APP_PROXY_BASE_URL || process.env.PUBLIC_BASE_URL || '';
  if (!path || !code) {
    throw new Error('Notable case info downstream route is not configured');
  }
  // If host already includes a scheme, use it as-is. Otherwise treat it as host-only.
  const base = host ? host.replace(/\/+$/, '') : '';
  return `${base}/${path}?code=${encodeURIComponent(code)}`;
}

router.post('/', async (req, res) => {
  const {
    initials,
    context_type,
    display_number,
    prospect_id,
    summary,
  } = req.body || {};

  let submissionId = null;
  try {
    const ref = context_type === 'C' ? (display_number || '') : (prospect_id || '');
    submissionId = await recordSubmission({
      formKey: 'notable-case-info',
      submittedBy: String(initials || 'UNK').slice(0, 10),
      lane: 'Log',
      payload: req.body,
      summary: `Notable case info [${context_type || '?'}] ${ref}${summary ? ` — ${summary}` : ''}`.slice(0, 400),
    });
  } catch (logErr) {
    trackException(logErr, { phase: 'notableCaseInfo.recordSubmission' });
  }

  let downstreamUrl;
  try {
    downstreamUrl = resolveDownstreamUrl();
  } catch (err) {
    if (submissionId) {
      await markFailed(submissionId, {
        lastEvent: 'notable-case-info:config:missing',
        error: err,
      });
    }
    return res.status(503).json({
      error: 'Notable case info endpoint is not configured on the server',
      code: 'DOWNSTREAM_NOT_CONFIGURED',
    });
  }

  try {
    const response = await fetch(downstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      await recordStep(submissionId, {
        name: 'notable-case-info.forward',
        status: 'failed',
        error: `HTTP ${response.status}: ${text?.slice(0, 500) || ''}`,
      });
      if (submissionId) {
        await markFailed(submissionId, {
          lastEvent: `notable-case-info:http-${response.status}`,
          error: new Error(`Downstream HTTP ${response.status}`),
        });
      }
      return res.status(response.status).json({
        error: 'Downstream request failed',
        status: response.status,
        body: parsed || text,
      });
    }

    await recordStep(submissionId, {
      name: 'notable-case-info.forward',
      status: 'success',
      output: parsed && typeof parsed === 'object' ? parsed : undefined,
    });
    await markComplete(submissionId, { lastEvent: 'notable-case-info forwarded' });

    return res.status(200).json(parsed || { success: true });
  } catch (error) {
    console.error('[notable-case-info] forward error:', error);
    if (submissionId) {
      await markFailed(submissionId, {
        lastEvent: 'notable-case-info:forward:failed',
        error,
      });
    }
    return res.status(502).json({
      error: 'Failed to reach notable case info endpoint',
      details: error?.message || String(error),
    });
  }
});

module.exports = router;
