const express = require('express');
const fetch = global.fetch || require('node-fetch');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolvePitchBackendBaseUrl() {
  const candidates = [
    process.env.PITCH_BACKEND_URL,
    process.env.REACT_APP_PITCH_BACKEND_URL,
    process.env.REACT_APP_INSTRUCTIONS_URL,
    process.env.DEAL_INSTRUCTIONS_URL,
    'https://instruct.helix-law.com/pitch',
  ];

  for (const candidate of candidates) {
    const raw = asTrimmedString(candidate);
    if (!raw) continue;

    try {
      return new URL(raw).origin;
    } catch {
      // Ignore malformed candidates and keep walking the fallback ladder.
    }
  }

  return 'https://instruct.helix-law.com';
}

function resolveTriggeredBy(req) {
  return asTrimmedString(req.user?.email)
    || asTrimmedString(req.user?.Email)
    || asTrimmedString(req.body?.requested_by)
    || asTrimmedString(req.query?.email)
    || 'unknown';
}

function resolvePitchedBy(req) {
  return (
    asTrimmedString(req.body?.pitched_by)
    || asTrimmedString(req.user?.initials)
    || asTrimmedString(req.user?.Initials)
    || asTrimmedString(req.query?.initials)
  ).toUpperCase();
}

router.post('/ensure', async (req, res) => {
  const startedAt = Date.now();
  const triggeredBy = resolveTriggeredBy(req);
  const enquiryId = Number.parseInt(String(req.body?.enquiry_id ?? ''), 10);

  trackEvent('DocRequest.WorkspaceEnsure.Started', {
    operation: 'proxyEnsure',
    triggeredBy,
    enquiryId: Number.isFinite(enquiryId) ? String(enquiryId) : 'unknown',
  });

  try {
    const pitchBackendBaseUrl = resolvePitchBackendBaseUrl();
    const currentOrigin = `${req.protocol}://${req.get('host')}`;

    if (pitchBackendBaseUrl === currentOrigin) {
      throw new Error('Pitch backend base URL resolves to the current app origin');
    }

    const upstreamUrl = `${pitchBackendBaseUrl}/api/doc-request-deals/ensure`;
    const requestedBy = triggeredBy !== 'unknown'
      ? triggeredBy.toLowerCase()
      : asTrimmedString(req.body?.requested_by).toLowerCase();
    const pitchedBy = resolvePitchedBy(req);

    const upstreamPayload = {
      ...(req.body || {}),
      ...(requestedBy ? { requested_by: requestedBy } : {}),
      ...(pitchedBy ? { pitched_by: pitchedBy } : {}),
    };

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamPayload),
    });

    const responseText = await upstreamResponse.text();
    let responseJson = null;
    if (responseText) {
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = null;
      }
    }

    const durationMs = Date.now() - startedAt;

    if (!upstreamResponse.ok) {
      const errorMessage = typeof responseJson?.error === 'string'
        ? responseJson.error
        : `Document request service returned HTTP ${upstreamResponse.status}`;

      trackEvent('DocRequest.WorkspaceEnsure.Failed', {
        operation: 'proxyEnsure',
        triggeredBy,
        enquiryId: Number.isFinite(enquiryId) ? String(enquiryId) : 'unknown',
        status: String(upstreamResponse.status),
        error: errorMessage,
      });
      trackMetric('DocRequest.WorkspaceEnsure.Duration', durationMs, {
        operation: 'proxyEnsure',
        status: String(upstreamResponse.status),
      });

      return res.status(upstreamResponse.status).json(
        responseJson && typeof responseJson === 'object'
          ? responseJson
          : { error: errorMessage }
      );
    }

    trackEvent('DocRequest.WorkspaceEnsure.Completed', {
      operation: 'proxyEnsure',
      triggeredBy,
      enquiryId: Number.isFinite(enquiryId) ? String(enquiryId) : 'unknown',
      status: String(upstreamResponse.status),
    });
    trackMetric('DocRequest.WorkspaceEnsure.Duration', durationMs, {
      operation: 'proxyEnsure',
      status: String(upstreamResponse.status),
    });

    if (responseJson && typeof responseJson === 'object') {
      return res.status(upstreamResponse.status).json(responseJson);
    }

    return res.status(upstreamResponse.status).send(responseText);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      operation: 'proxyEnsure',
      phase: 'doc-request-proxy',
      triggeredBy,
      enquiryId: Number.isFinite(enquiryId) ? String(enquiryId) : 'unknown',
    });
    trackEvent('DocRequest.WorkspaceEnsure.Failed', {
      operation: 'proxyEnsure',
      triggeredBy,
      enquiryId: Number.isFinite(enquiryId) ? String(enquiryId) : 'unknown',
      status: '502',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    trackMetric('DocRequest.WorkspaceEnsure.Duration', durationMs, {
      operation: 'proxyEnsure',
      status: '502',
    });

    return res.status(502).json({
      error: 'Document request service unavailable',
    });
  }
});

module.exports = router;