const { sendCardToDM } = require('./teamsNotificationClient');
const { getTeamEmail } = require('./teamLookup');
const { trackEvent, trackException, trackMetric } = require('./appInsights');
const { createLogger } = require('./logger');

const log = createLogger('PitchTeamsNotifications');

function cleanText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function isHelixEmail(value) {
  const email = cleanEmail(value);
  return email.endsWith('@helix-law.com') ? email : '';
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not specified';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildClientName(input = {}) {
  const explicit = cleanText(input.clientName || input.contactName);
  if (explicit) return explicit;

  const first = cleanText(input.firstName);
  const last = cleanText(input.lastName);
  const name = `${first} ${last}`.trim();
  if (name) return name;

  return cleanText(input.leadClientEmail || input.contactEmail || input.email, 'Client');
}

function buildCopyText({ clientName, instructionsUrl, passcode, instructionRef, amount, serviceDescription }) {
  return [
    `Client: ${clientName}`,
    `Pitch link: ${instructionsUrl}`,
    `Passcode: ${passcode}`,
    instructionRef ? `Instruction ref: ${instructionRef}` : '',
    `Fee: ${formatCurrency(amount)}`,
    serviceDescription ? `Scope: ${serviceDescription}` : '',
  ].filter(Boolean).join('\n');
}

function buildPitchNotificationCard(input = {}) {
  const clientName = buildClientName(input);
  const instructionsUrl = cleanText(input.instructionsUrl);
  const passcode = cleanText(input.passcode, 'n/a');
  const serviceDescription = cleanText(input.serviceDescription || input.initialScopeDescription, 'Pitch request');
  const areaOfWork = cleanText(input.areaOfWork, 'General');
  const instructionRef = cleanText(input.instructionRef);
  const dealId = cleanText(input.dealId);
  const requestedBy = cleanText(input.requestedBy || input.pitchedBy, 'Hub');
  const amountLabel = formatCurrency(input.amount);
  const modeLabel = input.linkOnly ? 'Pitch link' : 'Draft pitch';
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  const createdLabel = Number.isFinite(createdAt.getTime())
    ? createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Just now';
  const copyText = buildCopyText({ clientName, instructionsUrl, passcode, instructionRef, amount: input.amount, serviceDescription });

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'auto',
            items: [{
              type: 'Image',
              url: 'https://helix-law.com/favicon.ico',
              size: 'Small',
              style: 'Person',
            }],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: 'Pitch link ready',
                weight: 'Bolder',
                size: 'Medium',
              },
              {
                type: 'TextBlock',
                text: `${clientName} · ${areaOfWork} · ${createdLabel}`,
                isSubtle: true,
                spacing: 'None',
                size: 'Small',
                wrap: true,
              },
            ],
          },
        ],
      },
      {
        type: 'FactSet',
        spacing: 'Medium',
        facts: [
          { title: 'Client', value: clientName },
          { title: 'Mode', value: modeLabel },
          { title: 'Scope', value: serviceDescription },
          { title: 'Fee', value: amountLabel },
          { title: 'Passcode', value: passcode },
          ...(instructionRef ? [{ title: 'Ref', value: instructionRef }] : []),
          ...(dealId ? [{ title: 'Deal', value: dealId }] : []),
          { title: 'Requested by', value: requestedBy },
        ],
      },
      {
        type: 'TextBlock',
        text: 'Copy-ready details',
        weight: 'Bolder',
        size: 'Small',
        spacing: 'Medium',
      },
      {
        type: 'Input.Text',
        id: 'pitchCopyText',
        label: 'Pitch link details',
        value: copyText,
        isMultiline: true,
      },
    ],
    actions: [
      ...(instructionsUrl ? [{
        type: 'Action.OpenUrl',
        title: 'Open pitch link',
        url: instructionsUrl,
      }] : []),
    ],
  };
}

async function resolvePitchDmRecipient(input = {}) {
  const req = input.req || {};
  const explicitRecipient = isHelixEmail(input.recipientEmail);
  if (explicitRecipient) return explicitRecipient;

  const directCandidates = [
    req.user?.email,
    req.headers?.['x-user-email'],
    req.query?.email,
    input.feeEarnerEmail,
    input.emailRecipients?.feeEarnerEmail,
    input.pitchedBy,
  ];

  for (const candidate of directCandidates) {
    const email = isHelixEmail(candidate);
    if (email) return email;
  }

  const initialsCandidate = cleanText(req.user?.initials || req.headers?.['x-helix-initials'] || req.query?.initials || input.pitchedBy).toUpperCase();
  if (/^[A-Z]{2,4}$/.test(initialsCandidate)) {
    const resolvedEmail = await getTeamEmail(initialsCandidate).catch((error) => {
      log.warn('Failed to resolve pitch DM recipient from initials', { initials: initialsCandidate, error: error.message });
      return null;
    });
    const email = isHelixEmail(resolvedEmail);
    if (email) return email;
  }

  return '';
}

async function notifyPitchLinkReady(input = {}) {
  const startedAt = Date.now();
  const recipientEmail = await resolvePitchDmRecipient(input);

  if (!recipientEmail) {
    trackEvent('PitchTeamsNotification.Skipped', {
      operation: 'pitchTeamsNotification',
      reason: 'no-recipient',
      dealId: String(input.dealId || ''),
      instructionRef: String(input.instructionRef || ''),
    });
    return { success: false, skipped: true, reason: 'no-recipient' };
  }

  const card = buildPitchNotificationCard(input);
  trackEvent('PitchTeamsNotification.Started', {
    operation: 'pitchTeamsNotification',
    recipientEmail,
    dealId: String(input.dealId || ''),
    instructionRef: String(input.instructionRef || ''),
    linkOnly: String(Boolean(input.linkOnly)),
  });

  try {
    const result = await sendCardToDM(recipientEmail, card, `Pitch link ready · ${buildClientName(input)}`);
    const durationMs = Date.now() - startedAt;

    trackEvent(result.success ? 'PitchTeamsNotification.Completed' : 'PitchTeamsNotification.Failed', {
      operation: 'pitchTeamsNotification',
      recipientEmail,
      dealId: String(input.dealId || ''),
      instructionRef: String(input.instructionRef || ''),
      durationMs,
      error: result.error || '',
    });
    trackMetric('PitchTeamsNotification.Duration', durationMs, { operation: 'pitchTeamsNotification' });

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const durationMs = Date.now() - startedAt;
    trackException(err, {
      component: 'PitchTeamsNotification',
      operation: 'pitchTeamsNotification',
      phase: 'send',
      dealId: String(input.dealId || ''),
      instructionRef: String(input.instructionRef || ''),
    });
    trackEvent('PitchTeamsNotification.Failed', {
      operation: 'pitchTeamsNotification',
      recipientEmail,
      dealId: String(input.dealId || ''),
      instructionRef: String(input.instructionRef || ''),
      durationMs,
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

function queuePitchLinkNotification(input = {}) {
  trackEvent('PitchTeamsNotification.Queued', {
    operation: 'pitchTeamsNotification',
    dealId: String(input.dealId || ''),
    instructionRef: String(input.instructionRef || ''),
    linkOnly: String(Boolean(input.linkOnly)),
  });

  setImmediate(() => {
    notifyPitchLinkReady(input).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      trackException(err, {
        component: 'PitchTeamsNotification',
        operation: 'pitchTeamsNotification',
        phase: 'queue',
        dealId: String(input.dealId || ''),
        instructionRef: String(input.instructionRef || ''),
      });
    });
  });
}

module.exports = {
  buildPitchNotificationCard,
  notifyPitchLinkReady,
  queuePitchLinkNotification,
  resolvePitchDmRecipient,
};