const TEAMS_TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

function resolveMessageId(value) {
  if (!value) return null;
  if (typeof value === 'number' && value > 1640995200000) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.startsWith('0:')) {
    const tail = raw.split(':')[1];
    if (tail && /^\d{13,}$/.test(tail)) {
      return Number(tail);
    }
  }

  const match = raw.match(/\d{13,}/);
  return match ? Number(match[0]) : null;
}

function resolveChannelName(channelId) {
  if (!channelId) return 'General';
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) return 'Commercial New Enquiries';
  if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) return 'Construction New Enquiries';
  if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) return 'Property New Enquiries';
  if (channelId.includes('c821ba226cbb42fca2cfbe15efddfad7')) return 'Dev';
  if (channelId.includes('b50026477f054abeae7f8035274f7e2e')) return 'API Testing';
  if (channelId.includes('83484a22d83941fd93710c08b821cbb2')) return 'Outreach';
  return 'General';
}

function buildTeamsDeepLink(channelId, activityId, teamId, teamsMessageId, createdAtMs, messageTimestamp) {
  if (!channelId || !teamId) {
    return null;
  }

  let messageId = resolveMessageId(teamsMessageId) || resolveMessageId(activityId) || null;

  if (!messageId && messageTimestamp) {
    const parsed = Date.parse(messageTimestamp);
    if (!Number.isNaN(parsed)) {
      messageId = parsed;
    }
  }

  if (!messageId) {
    messageId = resolveMessageId(createdAtMs) || resolveMessageId(messageTimestamp);
  }

  if (!messageId) {
    return null;
  }

  const channelName = resolveChannelName(channelId);
  const messageIdToken = String(messageId);
  const encodedChannelId = encodeURIComponent(channelId);
  const encodedMessageId = encodeURIComponent(messageIdToken);
  const query = new URLSearchParams({
    tenantId: TEAMS_TENANT_ID,
    groupId: teamId,
    parentMessageId: messageIdToken,
    createdTime: messageIdToken,
  });

  if (channelName) {
    query.set('channelName', channelName);
  }

  return `https://teams.microsoft.com/l/message/${encodedChannelId}/${encodedMessageId}?${query.toString()}`;
}

module.exports = {
  buildTeamsDeepLink,
  resolveChannelName,
  resolveMessageId,
};