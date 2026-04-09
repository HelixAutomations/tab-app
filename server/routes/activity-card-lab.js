const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { append, list } = require('../utils/opLog');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { CHANNEL_ROUTES, postAdaptiveCardToChannel } = require('../utils/teamsNotificationClient');
const { buildTeamsDeepLink } = require('../utils/teamsDeepLink');
const { TEMPLATE_DIR, TEMPLATE_CATALOG, getPublicTemplateMeta, resolveTemplate } = require('../activity-card-lab/catalog');

const router = express.Router();
const DEFAULT_RECENT_LIMIT = 6;
const MAX_RECENT_LIMIT = 12;

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RECENT_LIMIT;
  }
  return Math.min(parsed, MAX_RECENT_LIMIT);
}

function humanizeRouteKey(routeKey) {
  return String(routeKey || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildDefaultSamples(templateMeta) {
  const now = new Date();
  return {
    timestamp: now.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    enquiryId: `HLX-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`,
    colleagueEmail: 'lz@helix-law.com',
    ...templateMeta.sampleData,
  };
}

function interpolateTemplate(rawJson, sampleData) {
  let next = rawJson;
  Object.entries(sampleData).forEach(([key, value]) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), String(value));
  });
  return next;
}

function parseCard(rawJson) {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    throw new Error('Card JSON is empty');
  }
  return JSON.parse(rawJson);
}

function validateCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw new Error('Card payload must be a JSON object');
  }
  if (card.type !== 'AdaptiveCard') {
    throw new Error('Card payload must have type "AdaptiveCard"');
  }
  if (!Array.isArray(card.body)) {
    throw new Error('Card payload must include a body array');
  }

  const warnings = [];
  if (!card.$schema) warnings.push('Card is missing $schema. Teams usually tolerates this, but previews are more reliable with it.');
  if (!card.version) warnings.push('Card is missing a version. Add one before widening usage beyond Card Lab.');
  if (!card.body.length) warnings.push('Card body is empty. Teams will render a blank shell.');

  return warnings;
}

async function loadTemplate(templateId) {
  const templateMeta = resolveTemplate(templateId);
  if (!templateMeta) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const templatePath = path.join(TEMPLATE_DIR, templateMeta.fileName);
  const rawTemplate = await fs.readFile(templatePath, 'utf8');
  const rawJson = interpolateTemplate(rawTemplate, buildDefaultSamples(templateMeta));
  const card = parseCard(rawJson);

  return {
    rawJson,
    card,
    templateMeta,
  };
}

async function resolveCardPayload({ templateId, rawJson, card }) {
  if (templateId && !rawJson && !card) {
    return loadTemplate(templateId);
  }

  if (rawJson) {
    const parsedCard = parseCard(rawJson);
    return {
      rawJson,
      card: parsedCard,
      templateMeta: templateId ? resolveTemplate(templateId) : null,
    };
  }

  if (card && typeof card === 'object') {
    return {
      rawJson: JSON.stringify(card, null, 2),
      card,
      templateMeta: templateId ? resolveTemplate(templateId) : null,
    };
  }

  throw new Error('Provide templateId, rawJson, or card');
}

function getRouteOptions() {
  return Object.entries(CHANNEL_ROUTES).map(([key, value]) => ({
    key,
    label: humanizeRouteKey(key),
    teamId: value.teamId,
    channelId: value.channelId,
  }));
}

function mapRecentItem(event) {
  return {
    id: event.id,
    templateId: event.templateId || null,
    templateLabel: event.templateLabel || 'Manual card',
    routeKey: event.routeKey,
    routeLabel: event.routeLabel,
    title: event.title || `Sent ${event.templateLabel || 'card'} to ${event.routeLabel}`,
    summary: event.summary || '',
    teamsLink: event.teamsLink || null,
    messageId: event.messageId || null,
    timestamp: event.ts,
  };
}

router.get('/catalog', async (req, res) => {
  const startedAt = Date.now();
  trackEvent('ActivityCardLab.Catalog.Started', { operation: 'catalog' });

  try {
    const templates = TEMPLATE_CATALOG.map(getPublicTemplateMeta);
    const routes = getRouteOptions();
    const recent = list({ type: 'activity.cardlab.send', limit: DEFAULT_RECENT_LIMIT }).map(mapRecentItem);
    const durationMs = Date.now() - startedAt;

    trackEvent('ActivityCardLab.Catalog.Completed', {
      operation: 'catalog',
      templateCount: templates.length,
      routeCount: routes.length,
      durationMs,
    });
    trackMetric('ActivityCardLab.Catalog.Duration', durationMs, { operation: 'catalog' });

    return res.json({ templates, routes, recent });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackException(err, { component: 'ActivityCardLab', operation: 'catalog', phase: 'route' });
    trackEvent('ActivityCardLab.Catalog.Failed', { operation: 'catalog', error: err.message });
    return res.status(500).json({ error: 'Failed to load card lab catalog', detail: err.message });
  }
});

router.get('/template/:templateId', async (req, res) => {
  const startedAt = Date.now();
  const { templateId } = req.params;
  trackEvent('ActivityCardLab.Template.Started', { operation: 'template', templateId });

  try {
    const { rawJson, templateMeta } = await loadTemplate(templateId);
    const durationMs = Date.now() - startedAt;

    trackEvent('ActivityCardLab.Template.Completed', {
      operation: 'template',
      templateId,
      durationMs,
    });
    trackMetric('ActivityCardLab.Template.Duration', durationMs, { templateId });

    return res.json({
      template: getPublicTemplateMeta(templateMeta),
      rawJson,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = /Unknown template/i.test(err.message) ? 404 : 500;
    trackException(err, { component: 'ActivityCardLab', operation: 'template', templateId, phase: 'route' });
    trackEvent('ActivityCardLab.Template.Failed', { operation: 'template', templateId, error: err.message });
    return res.status(status).json({ error: 'Failed to load template', detail: err.message });
  }
});

router.post('/render', async (req, res) => {
  const startedAt = Date.now();
  const { templateId, rawJson, card } = req.body || {};

  trackEvent('ActivityCardLab.Render.Started', {
    operation: 'render',
    templateId: templateId || 'manual',
  });

  try {
    const resolved = await resolveCardPayload({ templateId, rawJson, card });
    const warnings = validateCard(resolved.card);
    const durationMs = Date.now() - startedAt;

    trackEvent('ActivityCardLab.Render.Completed', {
      operation: 'render',
      templateId: templateId || 'manual',
      warningCount: warnings.length,
      durationMs,
    });
    trackMetric('ActivityCardLab.Render.Duration', durationMs, {
      operation: 'render',
      templateId: templateId || 'manual',
    });

    return res.json({
      card: resolved.card,
      rawJson: resolved.rawJson,
      warnings,
      template: getPublicTemplateMeta(resolved.templateMeta),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackException(err, { component: 'ActivityCardLab', operation: 'render', phase: 'route' });
    trackEvent('ActivityCardLab.Render.Failed', {
      operation: 'render',
      templateId: templateId || 'manual',
      error: err.message,
    });
    return res.status(400).json({ error: 'Failed to render card', detail: err.message });
  }
});

router.post('/send', async (req, res) => {
  const startedAt = Date.now();
  const { templateId, rawJson, card, routeKey, summary } = req.body || {};

  trackEvent('ActivityCardLab.Send.Started', {
    operation: 'send',
    templateId: templateId || 'manual',
    routeKey: routeKey || 'missing',
  });

  try {
    const route = getRouteOptions().find((item) => item.key === routeKey);
    if (!route) {
      return res.status(400).json({ error: 'Invalid route', detail: 'Choose one of the supported Card Lab routes.' });
    }

    const resolved = await resolveCardPayload({ templateId, rawJson, card });
    const warnings = validateCard(resolved.card);

    const result = await postAdaptiveCardToChannel(
      route.teamId,
      route.channelId,
      resolved.card,
      summary || resolved.templateMeta?.summary || 'Activity Card Lab send',
    );

    if (!result.success) {
      throw new Error(result.error || `Teams send failed with status ${result.statusCode}`);
    }

    const teamsLink = buildTeamsDeepLink(
      route.channelId,
      result.messageId,
      route.teamId,
      result.messageId,
      null,
      null,
    );

    const logEntry = append({
      type: 'activity.cardlab.send',
      status: 'success',
      templateId: resolved.templateMeta?.id || templateId || 'manual',
      templateLabel: resolved.templateMeta?.label || 'Manual card',
      routeKey: route.key,
      routeLabel: route.label,
      messageId: result.messageId || null,
      teamsLink,
      title: `Card sent to ${route.label}`,
      summary: summary || resolved.templateMeta?.summary || 'Activity Card Lab send',
    });

    const durationMs = Date.now() - startedAt;
    trackEvent('ActivityCardLab.Send.Completed', {
      operation: 'send',
      templateId: resolved.templateMeta?.id || templateId || 'manual',
      routeKey: route.key,
      messageId: result.messageId || 'none',
      warningCount: warnings.length,
      durationMs,
    });
    trackMetric('ActivityCardLab.Send.Duration', durationMs, {
      operation: 'send',
      routeKey: route.key,
    });

    return res.json({
      success: true,
      messageId: result.messageId || null,
      teamsLink,
      warnings,
      item: mapRecentItem(logEntry),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const durationMs = Date.now() - startedAt;
    trackException(err, { component: 'ActivityCardLab', operation: 'send', phase: 'route' });
    trackEvent('ActivityCardLab.Send.Failed', {
      operation: 'send',
      templateId: templateId || 'manual',
      routeKey: routeKey || 'missing',
      error: err.message,
      durationMs,
    });
    trackMetric('ActivityCardLab.Send.Duration', durationMs, {
      operation: 'send',
      status: 'failed',
    });
    return res.status(502).json({ error: 'Failed to send card', detail: err.message });
  }
});

router.get('/recent', async (req, res) => {
  const limit = parseLimit(req.query.limit);

  try {
    const items = list({ type: 'activity.cardlab.send', limit }).map(mapRecentItem);
    return res.json({ items });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    trackException(err, { component: 'ActivityCardLab', operation: 'recent', phase: 'route' });
    return res.status(500).json({ error: 'Failed to load recent card sends', detail: err.message });
  }
});

module.exports = router;