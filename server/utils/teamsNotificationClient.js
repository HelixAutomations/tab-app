/**
 * Teams Notification Client — Graph token provider + message posting
 * 
 * Uses the Team-Hub-Notification-Handler app registration (3d935d23-349e-4502-a9c0-6f5ca48d5d33)
 * with client credentials flow to post Adaptive Cards and activity feed notifications
 * to Microsoft Teams via the Graph API.
 * 
 * Mirrors the pattern from enquiry-processing-v2's GraphTokenProvider + TeamsMessageService.
 */

const { getSecret } = require('./getSecret');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const log = require('./logger');

// ── Token cache ──────────────────────────────────────────────
let cachedToken = null;
let cachedExpiry = 0; // Unix ms

// ── Channel routes (mirrors enquiry-processing-v2 ChannelResolver) ──
const PRIMARY_TEAM_ID = 'b7d73ffb-70b5-45d6-9940-8f9cc7762135';
const NEW_ENQUIRIES_TEAM_ID = 'b5713068-4d7f-4aff-b538-0fa45ca6b2cc';

const CHANNEL_ROUTES = {
  commercial:    { teamId: PRIMARY_TEAM_ID,        channelId: '19:09c0d3669cd2464aab7db60520dd9180@thread.tacv2' },
  construction:  { teamId: PRIMARY_TEAM_ID,        channelId: '19:2ba7d5a50540426da60196c3b2daf8e8@thread.tacv2' },
  employment:    { teamId: PRIMARY_TEAM_ID,        channelId: '19:9e1c8918bca747f5afc9ca5acbd89683@thread.tacv2' },
  property:      { teamId: PRIMARY_TEAM_ID,        channelId: '19:6d09477d15d548a6b56f88c59b674da6@thread.tacv2' },
  general:       { teamId: PRIMARY_TEAM_ID,        channelId: '19:09c0d3669cd2464aab7db60520dd9180@thread.tacv2' },
  payments:      { teamId: '569d02f9-b6ae-4749-a7bb-f91f7c4731ca', channelId: '19:b9c3987695d540639163dd6df10046df@thread.tacv2' },
  dev:           { teamId: NEW_ENQUIRIES_TEAM_ID,  channelId: '19:c821ba226cbb42fca2cfbe15efddfad7@thread.tacv2' },
  'api-tests':   { teamId: PRIMARY_TEAM_ID,        channelId: '19:b50026477f054abeae7f8035274f7e2e@thread.tacv2' },
  outreach:      { teamId: NEW_ENQUIRIES_TEAM_ID,  channelId: '19:83484a22d83941fd93710c08b821cbb2@thread.tacv2' },
};

// ── Graph token (client credentials) ─────────────────────────
async function getGraphToken() {
  // Fast path: cached and valid for >5 min
  const now = Date.now();
  if (cachedToken && cachedExpiry - now > 5 * 60 * 1000) {
    return cachedToken;
  }

  const tenantId  = await getSecret('team-hub-notification-tenant-id');
  const appId     = await getSecret('team-hub-notification-app-id');
  const secret    = await getSecret('team-hub-notification-client-secret');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id:     appId,
    client_secret: secret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });

  const start = Date.now();
  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await resp.json();
  const durationMs = Date.now() - start;

  if (!resp.ok) {
    const err = new Error(`Graph token request failed: ${resp.status} ${data.error_description || data.error || ''}`);
    trackException(err, { operation: 'TeamsNotification.GetToken', status: resp.status });
    throw err;
  }

  cachedToken = data.access_token;
  cachedExpiry = now + (data.expires_in * 1000);
  log.info(`[TeamsNotify] Acquired Graph token (expires in ${data.expires_in}s, took ${durationMs}ms)`);
  trackMetric('TeamsNotification.TokenAcquire.Duration', durationMs);
  return cachedToken;
}

// ── Invalidate token (for retry after 401) ───────────────────
function invalidateToken() {
  cachedToken = null;
  cachedExpiry = 0;
}

// ── Resolve channel route ────────────────────────────────────
function resolveChannel(area) {
  const key = (area || 'general').toLowerCase().trim();
  return CHANNEL_ROUTES[key] || CHANNEL_ROUTES.general;
}

// ── Post Adaptive Card to channel via Graph API ──────────────
async function postAdaptiveCardToChannel(teamId, channelId, adaptiveCard, summary = 'Notification') {
  const token = await getGraphToken();
  const attachmentId = crypto.randomUUID();

  const payload = {
    body: {
      contentType: 'html',
      content: `<attachment id="${attachmentId}"></attachment>`,
    },
    attachments: [{
      id: attachmentId,
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: typeof adaptiveCard === 'string' ? adaptiveCard : JSON.stringify(adaptiveCard),
    }],
  };

  const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`;
  const start = Date.now();

  // Retry up to 3 times for 429/5xx
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await resp.text();
    const durationMs = Date.now() - start;

    if (resp.ok) {
      let messageId = null;
      try {
        const parsed = JSON.parse(body);
        messageId = parsed.id || null;
      } catch { /* ignore */ }

      log.info(`[TeamsNotify] Posted card to channel (attempt ${attempt + 1}, ${durationMs}ms)`);
      trackEvent('TeamsNotification.CardPosted', { teamId, channelId, messageId, durationMs: String(durationMs), attempt: String(attempt + 1) });
      trackMetric('TeamsNotification.PostCard.Duration', durationMs);
      return { success: true, messageId, statusCode: resp.status };
    }

    if (resp.status === 401 && attempt === 0) {
      log.warn('[TeamsNotify] 401 — invalidating token and retrying');
      invalidateToken();
      continue;
    }

    if (resp.status === 429 || resp.status >= 500) {
      const delay = Math.pow(2, attempt) * 1000;
      log.warn(`[TeamsNotify] ${resp.status} on attempt ${attempt + 1}, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    // Non-retryable error
    log.error(`[TeamsNotify] Post failed (${resp.status}): ${body.slice(0, 500)}`);
    trackEvent('TeamsNotification.CardFailed', { teamId, channelId, status: String(resp.status), error: body.slice(0, 300) });
    return { success: false, messageId: null, statusCode: resp.status, error: body.slice(0, 500) };
  }

  return { success: false, messageId: null, statusCode: 503, error: 'Max retries exceeded' };
}

// ── Post simple HTML message to channel ──────────────────────
async function postHtmlToChannel(teamId, channelId, html) {
  const token = await getGraphToken();
  const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: { contentType: 'html', content: html } }),
  });

  const body = await resp.text();
  if (!resp.ok) {
    log.error(`[TeamsNotify] HTML post failed (${resp.status}): ${body.slice(0, 500)}`);
    return { success: false, statusCode: resp.status, error: body.slice(0, 500) };
  }

  let messageId = null;
  try { messageId = JSON.parse(body).id; } catch { /* ignore */ }
  return { success: true, messageId, statusCode: resp.status };
}

// ── Send activity feed notification to a user ────────────────
async function sendActivityFeedNotification(userId, { activityType = 'taskCreated', previewText, topic }) {
  const token = await getGraphToken();
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/teamwork/sendActivityNotification`;

  const payload = {
    topic: {
      source: topic?.source || 'text',
      value: topic?.value || 'Team Hub',
      webUrl: topic?.webUrl || undefined,
    },
    activityType,
    previewText: { content: previewText || 'New notification' },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (resp.status === 204 || resp.ok) {
    trackEvent('TeamsNotification.ActivityFeed.Sent', { userId, activityType });
    return { success: true };
  }

  const body = await resp.text();
  log.error(`[TeamsNotify] Activity feed failed (${resp.status}): ${body.slice(0, 500)}`);
  trackEvent('TeamsNotification.ActivityFeed.Failed', { userId, activityType, status: String(resp.status) });
  return { success: false, statusCode: resp.status, error: body.slice(0, 500) };
}

// ── Convenience: post card to area-of-work channel ───────────
async function postCardToArea(area, adaptiveCard, summary) {
  const { teamId, channelId } = resolveChannel(area);
  return postAdaptiveCardToChannel(teamId, channelId, adaptiveCard, summary);
}

module.exports = {
  getGraphToken,
  resolveChannel,
  postAdaptiveCardToChannel,
  postHtmlToChannel,
  sendActivityFeedNotification,
  postCardToArea,
  CHANNEL_ROUTES,
  PRIMARY_TEAM_ID,
  NEW_ENQUIRIES_TEAM_ID,
};
